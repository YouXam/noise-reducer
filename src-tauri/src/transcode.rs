use hound::{SampleFormat, WavSpec, WavWriter};
use std::fs::File;
use std::io::{BufWriter, Read};
use symphonia::core::audio::AudioBufferRef;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

pub fn transcode(input_path: &str) -> anyhow::Result<(Vec<u8>, String)> {
    let file = tempfile::NamedTempFile::new()?;
    let output_wav = file.path().to_str().unwrap().to_string();
    transcode_to_file(input_path, &output_wav)?;
    file.keep()?;
    let mut buf = Vec::new();
    File::open(&output_wav)?.read_to_end(&mut buf)?;
    Ok((buf, output_wav))
}

fn transcode_to_file(input_path: &str, output_path: &str) -> anyhow::Result<()> {
    if input_path.ends_with(".ogg") {
        convert_ogg_to_wav(input_path, output_path)?;
    } else if input_path.ends_with(".mp4") {
        convert_mp4_to_wav(input_path, output_path)?;
    } else if input_path.ends_with(".wav") {
        std::fs::copy(input_path, output_path)?;
    } else {
        return Err(anyhow::Error::msg("Unsupported file format"));
    }
    Ok(())
}
fn convert_mp4_to_wav(input_mp4: &str, output_wav: &str) -> anyhow::Result<()> {
    let src = File::open(input_mp4)?;
    let mss = MediaSourceStream::new(Box::new(src), Default::default());

    let mut hint = Hint::new();
    hint.with_extension(".mp4");
    let mut format = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )?
        .format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or("No audio track found")
        .map_err(anyhow::Error::msg)?;
    let codec_params = &track.codec_params;
    let mut decoder =
        symphonia::default::get_codecs().make(codec_params, &DecoderOptions::default())?;
    let spec = WavSpec {
        channels: codec_params.channels.map_or(1, |c| c.count() as u16),
        sample_rate: codec_params.sample_rate.unwrap_or(44100) as u32,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let writer = BufWriter::new(File::create(output_wav)?);
    let mut wav_writer = WavWriter::new(writer, spec)?;
    let track_id = track.id;
    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = decoder.decode(&packet)?;
        match decoded {
            AudioBufferRef::F32(buf) => {
                let planes = buf.planes();
                if let Some(plane) = planes.planes().iter().next() {
                    for &sample in plane.iter() {
                        let sample_i16 = (sample * i16::MAX as f32).clamp(i16::MIN as f32, i16::MAX as f32) as i16;
                        wav_writer.write_sample(sample_i16)?;
                    }
                }
            }
            _ => {
                unreachable!()
            }
        }
    }

    wav_writer.finalize()?;

    Ok(())
}

fn convert_ogg_to_wav(input_path: &str, output_path: &str) -> anyhow::Result<()> {
    let file = File::open(input_path)?;
    let (raw, header) = ogg_opus::decode::<_, 16000>(file)?;

    let spec = WavSpec {
        channels: header.channels,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let writer = BufWriter::new(File::create(output_path)?);
    let mut wav_writer = WavWriter::new(writer, spec)?;

    for sample in raw {
        wav_writer.write_sample(sample)?;
    }

    wav_writer.finalize()?;

    Ok(())
}
