import { useState, useRef, useEffect } from 'react';

export const useRecorder = () => {
    const [status, setStatus] = useState('idle');
    const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
    const [level, setLevel] = useState<number>(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const finishResolver = useRef<(_: string) => string>(x => x);

    const startRecording = async () => {
        setStatus('initiating');
        setTimeout(async () => {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            try {
                mediaRecorderRef.current =
                    new MediaRecorder(stream, {
                        mimeType: MediaRecorder.isTypeSupported('audio/ogg; codecs=opus') ?
                            'audio/ogg; codecs=opus' :
                            'audio/mp4'
                    })
            } catch (e) {
                alert('初始化录音失败');
                return
            }
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                chunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: chunksRef.current[0].type });
                const url = URL.createObjectURL(blob);
                setMediaBlobUrl(url);
                setStatus('idle');
                finishResolver.current(url);
            };
            if (mediaRecorderRef.current) mediaRecorderRef.current.start();
            setStatus('recording');
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            source.connect(analyserRef.current);

            analyserRef.current.fftSize = 256;
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const draw = () => {
                analyserRef.current!.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
                setLevel(avg / 256);
                animationFrameRef.current = requestAnimationFrame(draw);
            };

            draw();
        }, 100);
    };

    const stopRecording = async () => {
        const url: Promise<string> = new Promise((resolve) => {
            finishResolver.current = resolve as (_: string) => string;
        })
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        return await url!;
    };

    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    return { status, startRecording, stopRecording, mediaBlobUrl, level };
};

