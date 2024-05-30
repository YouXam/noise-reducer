// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;

use tauri::Window;

mod fir;
mod rnn;
mod transcode;

#[tauri::command]
async fn to_wav(path: String) -> Result<(Vec<u8>, String), String> {
    match transcode::transcode(&path) {
        Ok(path) => Ok(path),
        Err(e) => {
            eprintln!("Error: {:?}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn add_noise(
    wav_path: std::path::PathBuf,
    snr: f32,
    window: Window,
) -> Result<(Vec<u8>, String), String> {
    match fir::add_noise(wav_path, snr, window) {
        Ok(data) => Ok(data),
        Err(e) => {
            eprintln!("Error: {:?}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn denoise(
    noise_path: std::path::PathBuf,
    noiselesser: String,
    range: (i32, i32),
    window: Window,
) -> Result<(Vec<u8>, String), String> {
    if noiselesser == "fir" {
        match fir::denoise(noise_path, range, window) {
            Ok(data) => Ok(data),
            Err(e) => {
                eprintln!("Error: {:?}", e);
                Err(e.to_string())
            }
        }
    } else if noiselesser == "rnn" {
        match rnn::denoise(noise_path) {
            Ok(path) => {
                use std::fs::File;
                use std::io::Read;

                let mut file = File::open(&path).map_err(|e| e.to_string())?;
                let mut buffer = Vec::new();
                file.read_to_end(&mut buffer).unwrap();

                Ok((buffer, path.to_string()))
            }
            Err(e) => {
                eprintln!("Error: {:?}", e);
                Err(e.to_string())
            }
        }
    } else {
        Err("Invalid noiselesser".to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![to_wav, add_noise, denoise])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
