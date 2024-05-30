import { cn } from '@/lib/utils';
import React, { useRef, useState, useEffect } from 'react';
import { save } from '@tauri-apps/api/dialog';
import { writeBinaryFile } from '@tauri-apps/api/fs';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface AudioPlayerProps {
    title: string;
    src: string | null;
    className?: string;
    tip?: string
    uploadTip?: string
    onClose?: () => void
    onUpload?: ((file: File) => boolean) | ((file: File) => Promise<boolean>)
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ title, src, className, tip, uploadTip, onClose, onUpload }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [progress, setProgress] = useState(0);

    if (!src && isPlaying) {
        setIsPlaying(false);
    }

    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            const updateProgress = () => {
                setCurrentTime(audio.currentTime);
                setProgress((audio.currentTime / audio.duration) * 100);
            };
            const onLoadedMetadata = () => {
                setDuration(audio.duration);
                setCurrentTime(audio.currentTime);
                setProgress((audio.currentTime / audio.duration) * 100);
            }

            const onEnded = () => {
                setIsPlaying(false);
                setCurrentTime(0);
                setProgress(0);
                audio.currentTime = 0;
            }

            audio.addEventListener('timeupdate', updateProgress);
            audio.addEventListener('loadedmetadata', onLoadedMetadata);
            audio.addEventListener('ended', onEnded)

            return () => {
                audio.removeEventListener('timeupdate', updateProgress);
                audio.removeEventListener('loadedmetadata', onLoadedMetadata);
                audio.removeEventListener('ended', onEnded)
            };
        }
    }, [src]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (audio) {
            if (isPlaying) {
                audio.pause();
            } else {
                audio.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = (parseFloat(e.target.value) / 100) * duration;
        if (audioRef.current) {
            audioRef.current.currentTime = newTime;
            setCurrentTime(newTime);
            setProgress(parseFloat(e.target.value));
        }
    };

    const download = async () => {
        const path = await save({
            filters: [{
                name: 'Audio',
                extensions: ['wav']
            }]
        });
        if (!path) return;
        const res = await fetch(src!);
        const blob = await res.blob();
        const buffer = await blob.arrayBuffer();
        await writeBinaryFile(path, new Uint8Array(buffer));
    }

    if (!src) {
        return (
            <div className="border-2 border-dotted border-gray-400 rounded-lg max-w-md mx-auto w-[300px] h-[120px] flex flex-col items-center justify-center">
                {tip && !uploadTip && <div className="text-gray-500 select-none cursor-default">{tip || ''}</div>}
                {uploadTip && <div className='px-4 space-y-2'>
                    <Label htmlFor="file">{uploadTip}</Label>
                    <Input
                        id="file"
                        type="file"
                        accept=".wav"
                        placeholder='上传文件'
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && onUpload && !await onUpload(file)) {
                                e.target.value = '';
                            }
                        }}
                    />
                </div>}
            </div>
        )
    }

    return (
        <div className={cn(
            `relative border-2 border-gray-400 rounded-lg px-4 py-1 pt-4 max-w-md mx-auto w-[300px] transition-shadow ${className}`,
            {
                'shadow-xl': isPlaying
            }
        )}>
            <button
                onClick={() => {
                    setIsPlaying(false);
                    setCurrentTime(0);
                    setProgress(0);
                    const audio = audioRef.current;
                    if (audio) {
                        audio.pause();
                        audio.currentTime = 0;
                    }
                    if (onClose) {
                        onClose();
                    }
                }}
                className="absolute -top-3 -right-3 rounded-full bg-white text-gray-500 hover:text-gray-700 focus:outline-none dark:text-gray-400 dark:hover:text-gray-300"
            >
                <CloseIcon className="w-6 h-6" />
                <span className="sr-only">Close</span>
            </button>
            <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold">{title}</h2>
                <button
                    onClick={download}
                    className="text-gray-500 hover:text-gray-700 focus:outline-none dark:text-gray-400 dark:hover:text-gray-300"
                >
                    <DownloadIcon className="w-6 h-6" />
                    <span className="sr-only">Download</span>
                </button>
            </div>
            <div>
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={togglePlay}
                            className="text-gray-500 hover:text-gray-700 focus:outline-none dark:text-gray-400 dark:hover:text-gray-300"
                        >
                            {isPlaying ? (
                                <PauseIcon className="w-8 h-8" />
                            ) : (
                                <PlayIcon className="w-8 h-8" />
                            )}
                            <span className="sr-only">Play</span>
                        </button>
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">
                        <span>{formatTime(currentTime)}</span> / <span>{formatTime(duration)}</span>
                    </div>
                </div>
                <div className="mb-1">
                    <input
                        type="range"
                        className="w-full range range-xs"
                        value={progress}
                        step={0.001}
                        onChange={handleProgressChange}
                    />
                </div>
            </div>
            <audio ref={audioRef} src={src}></audio>
        </div>
    );
};

const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z" />
        </svg>
    )
}


function DownloadIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
    )
}

function PauseIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
        </svg>

    );
}


function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
        </svg>
    )
}

export default AudioPlayer;