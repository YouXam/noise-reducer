use hound::{self};
use rand_distr::{Distribution, Normal};
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use std::f32::consts::PI;
use std::io::Read;

fn read_audio(filename: &str) -> anyhow::Result<(Vec<f32>, hound::WavSpec)> {
    let mut reader = hound::WavReader::open(filename)?;
    let spec = reader.spec();
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.map(|s| s as f32 / i16::MAX as f32))
        .collect::<Result<Vec<_>, _>>()?;
    Ok((samples, spec))
}

fn signal_power(signal: &[f32]) -> f32 {
    signal.iter().map(|&s| s * s).sum::<f32>() / signal.len() as f32
}

fn generate_noise(signal: &[f32], snr_db: f32) -> Vec<f32> {
    let signal_power = signal_power(signal);
    let snr = 10.0_f32.powf(snr_db / 10.0);
    let noise_power = signal_power / snr;
    let noise_std = noise_power.sqrt();
    let normal = Normal::new(0.0, noise_std).unwrap();
    let mut rng = rand::thread_rng();
    normal.sample_iter(&mut rng).take(signal.len()).collect()
}

fn add_noise_to(signal: &[f32], noise: &[f32]) -> Vec<f32> {
    signal
        .iter()
        .zip(noise.iter())
        .map(|(&s, &n)| s + n)
        .collect()
}

fn design_bandpass_filter(
    length: usize,
    low_cut: f32,
    high_cut: f32,
    sample_rate: f32,
) -> Vec<f32> {
    let mut filter = vec![0.0; length];
    let center = (length / 2) as isize;

    for i in 0..length {
        let i = i as isize;
        let sinc = if i == center {
            2.0 * (high_cut - low_cut) / sample_rate
        } else {
            let x = (i - center) as f32 * PI / sample_rate;
            ((high_cut * x).sin() - (low_cut * x).sin()) / (i - center) as f32 / PI
        };
        filter[i as usize] =
            sinc * (0.54 - 0.46 * ((2.0 * PI * i as f32) / (length as f32 - 1.0)).cos());
    }

    filter
}

fn apply_filter_fft(signal: &[f32], filter: &[f32]) -> Vec<f32> {
    let signal_len = signal.len();
    let filter_len = filter.len();
    let output_len = signal_len + filter_len - 1;

    let mut planner = FftPlanner::new();
    let fft_len = output_len.next_power_of_two();

    let fft = planner.plan_fft_forward(fft_len);
    let ifft = planner.plan_fft_inverse(fft_len);

    let mut signal_complex: Vec<Complex<f32>> =
        signal.iter().map(|&x| Complex { re: x, im: 0.0 }).collect();
    let mut filter_complex: Vec<Complex<f32>> =
        filter.iter().map(|&x| Complex { re: x, im: 0.0 }).collect();

    signal_complex.resize(fft_len, Complex { re: 0.0, im: 0.0 });
    filter_complex.resize(fft_len, Complex { re: 0.0, im: 0.0 });

    fft.process(&mut signal_complex);
    fft.process(&mut filter_complex);

    let mut result_complex: Vec<Complex<f32>> = signal_complex
        .iter()
        .zip(filter_complex.iter())
        .map(|(&x, &y)| x * y)
        .collect();

    ifft.process(&mut result_complex);

    result_complex
        .iter()
        .map(|&x| x.re / fft_len as f32)
        .collect::<Vec<f32>>()[..output_len]
        .to_vec()
}

pub fn add_noise(
    wav_path: std::path::PathBuf,
    snr: f32,
    window: tauri::Window,
) -> anyhow::Result<(Vec<u8>, String)> {
    let (signal, spec) = read_audio(
        wav_path
            .to_str()
            .ok_or("Invalid path")
            .map_err(anyhow::Error::msg)?,
    )?;

    let noise = generate_noise(&signal, snr);
    window.emit("noise_generated", ())?;

    let noisy_signal = add_noise_to(&signal, &noise);

    let file = tempfile::NamedTempFile::new()?;
    let path = file
        .path()
        .to_str()
        .ok_or("Invalid path")
        .map_err(anyhow::Error::msg)?
        .to_owned();

    let mut writer = hound::WavWriter::create(&path, spec)?;
    for &sample in noisy_signal.iter() {
        writer.write_sample((sample * i16::MAX as f32) as i16)?;
    }
    writer.finalize()?;

    let mut buf = Vec::new();
    std::fs::File::open(&path)?.read_to_end(&mut buf)?;

    file.keep()?;
    Ok((buf, path))
}

pub fn denoise(
    noise_path: std::path::PathBuf,
    range: (i32, i32),
    window: tauri::Window,
) -> anyhow::Result<(Vec<u8>, String)> {
    let (signal, spec) = read_audio(
        noise_path
            .to_str()
            .ok_or("Invalid path")
            .map_err(anyhow::Error::msg)?,
    )?;

    window.emit("noise_loaded", ())?;

    let filter = design_bandpass_filter(
        1025,
        range.0 as f32,
        range.1 as f32,
        spec.sample_rate as f32,
    );
    window.emit("filter_generated", ())?;

    let mut out_buf = vec![vec![0.0; signal.len() / spec.channels as usize]; spec.channels as usize];

    for (i, frame) in signal.chunks(spec.channels as usize).enumerate() {
        for (j, sample) in frame.iter().enumerate() {
            out_buf[j][i] = *sample;
        }
    }

    for i in 0..spec.channels as usize {
        out_buf[i] = apply_filter_fft(&out_buf[i], &filter);
    }

    window.emit("filter_applied", ())?;

    let file = tempfile::NamedTempFile::new()?;
    let path: String = file
        .path()
        .to_str()
        .ok_or("Invalid path")
        .map_err(anyhow::Error::msg)?
        .to_owned();

    let mut writer = hound::WavWriter::create(&path, spec)?;

    for i in 0..out_buf[0].len() {
        for j in 0..spec.channels as usize {
            writer.write_sample((out_buf[j][i] * i16::MAX as f32) as i16)?;
        }
    }

    writer.finalize()?;

    window.emit("denoised", ())?;

    let mut buf = Vec::new();

    std::fs::File::open(&path)?.read_to_end(&mut buf)?;

    file.keep()?;

    Ok((buf, path))
}
