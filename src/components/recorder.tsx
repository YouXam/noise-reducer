import { useState } from 'react';
import { Button } from '@/components/ui/button';
import Loading from '@/assets/loading.svg'
import { useRecorder } from '@/hooks/audio';
import { cn } from '@/lib/utils';

export function Recorder({ onRecorded }: { onRecorded?: (_: string) => void }) {
    const { status, startRecording, stopRecording, level } = useRecorder();
    const [first, setFirst] = useState(true);
    return (
        <>
            <Button
                className={cn(
                    "w-20 h-20 rounded-full text-white hover:text-white hover:outline-none hover:ring-2 hover:ring-offset-8 relative transition-colors duration-75",
                    {
                        'bg-red-500 hover:bg-red-600 hover:ring-0': status === 'recording' || status === 'initiating' && !first,
                        'hover:bg-gray-700 bg-black hover:ring-gray-600': status === 'idle',
                        'bg-yellow-500 hover:bg-yellow-500 ring-2 ring-offset-8 ring-yellow-500': status === 'initiating' && first
                    }
                )}
                size="icon"
                onClick={async () => {
                    if (status === 'initiating') return;
                    if (status === 'recording') {
                        if (onRecorded) onRecorded(await stopRecording())
                        else stopRecording()
                        setFirst(false)
                    } else {
                        startRecording()
                    }
                }}
                variant="ghost"
            >
                {status === 'initiating' && first ? <img src={Loading} className='text-white w-8 h-8' /> : <MicIcon className="w-8 h-8" />}
                {status === 'recording' && <span className="border-red-500 border-2 rounded-full absolute transition-transform" style={{
                    width: 100,
                    height: 100,
                    transform: `scale(${level * 5 + 1})`,
                    transition: 'transform 10ms'
                }}></span>}
            </Button>
        </>
    )
}

function MicIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
    )
}