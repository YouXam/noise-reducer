import AudioPlayer from '@/components/player';
import { Recorder } from '@/components/recorder';
import { useEffect, useRef, useState } from 'react';
import { tempdir } from '@tauri-apps/api/os';
import { writeBinaryFile } from '@tauri-apps/api/fs';
import { invoke } from '@tauri-apps/api'
import { AsyncEventEmitter } from '@/lib/event';
import { listen } from '@tauri-apps/api/event'
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const App: React.FC = () => {
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [noiseUrl, setNoiseUrl] = useState<string | null>(null);
  const [noiselessUrl, setNoiselessUrl] = useState<string | null>(null);
  const [recordingTip, setRecordingTip] = useState<string>("选择音频文件");
  const [noiseTip, setNoiseTip] = useState<string>("选择噪音文件");
  const [wavPath, setWavPath] = useState<string | null>(null);
  const [noisePath, setNoisePath] = useState<string | null>(null);
  const [snr, setSnr] = useState<number>(20);
  const [noiselesser, setNoiselesser] = useState<string>('fir');
  const [noiselessTip, setNoiselessTip] = useState<string>("请完成前置步骤");
  const [range, setRange] = useState<[number, number]>([0, 2048]);
  const noise = useRef<AsyncEventEmitter<{ noise_generated: void }>>(new AsyncEventEmitter());
  const noiseless = useRef<AsyncEventEmitter<{
    noise_loaded: void;
    filter_generated: void;
    filter_applied: void;
    denoised: void;
  }>>(new AsyncEventEmitter());

  useEffect(() => {
    const noise_events: Array<keyof typeof noise.current.events> = [
      'noise_generated'
    ]
    const noiseless_events: Array<keyof typeof noiseless.current.events> = [
      'noise_loaded',
      'filter_generated',
      'filter_applied',
      'denoised',
    ]
    const unlistenPromises = [
      ...noise_events.map(event => listen(event, () => {
        noise.current.emit(event)
      })),
      ...noiseless_events.map(event => listen(event, () => {
        noiseless.current.emit(event)
      }))
    ]

    return () => {
      unlistenPromises.forEach(unlistenPromise => unlistenPromise.then(unlisten => unlisten()))
    }
  }, [])

  async function save(url: string) {
    const res = await fetch(url)
    const blob = await res.blob()
    const tempdirPath = await tempdir();
    let ext = 'wav';
    if (blob.type.includes('mp4')) ext = 'mp4'
    else if (blob.type.includes('ogg')) ext = 'ogg'
    const path = `${tempdirPath}record.${ext}`;
    await writeBinaryFile(
      path,
      await blob.arrayBuffer(),
    );
    return path;
  }

  async function transcode(url: string) {
    try {
      setRecordingUrl(null);
      setNoiseUrl(null);
      setNoiselessUrl(null);
      setWavPath(null);
      setNoisePath(null);
      setNoiselessTip("请完成前置步骤");
      setNoiseTip("选择噪音文件");
      setRecordingTip("转码中...")
      const path = await save(url);
      const [wavData, wavPath]: [number[], string] = await invoke('to_wav', { path }).catch((error) => {
        alert("转码失败: " + (error as any).toString());
        throw false;
      }) as [number[], string];
      setWavPath(wavPath)
      const wavBlob = new Blob([new Uint8Array(wavData)], { type: 'audio/wav' });
      const wavUrl = URL.createObjectURL(wavBlob);
      setRecordingUrl(wavUrl);
      setNoiseTip("点击“加噪”以添加噪音")
      setNoiseUrl(null);
      setNoiselessUrl(null);
      setNoiselessTip("请完成前置步骤");
    } catch (error) {
      if (error === false) return;
      alert("转码失败: " + (error as any).toString());
    }
  }

  async function addNoise() {
    try {
      const now = Date.now();
      setNoiseUrl(null);
      setNoiseTip("生成噪音中...")
      const noisePromise: Promise<[number[], string]> = invoke('add_noise', { wavPath, snr }).catch((error) => {
        alert("添加噪音失败: " + (error as any).toString());
        setNoiseTip("点击“加噪”以添加噪音")
        throw false;
      }) as Promise<[number[], string]>;
      await noise.current.wait('noise_generated');
      setNoiseTip("添加噪音中...")
      const [noisedData, noisedPath] = await noisePromise;
      const noisedBlob = new Blob([new Uint8Array(noisedData)], { type: 'audio/wav' });
      const noisedUrl = URL.createObjectURL(noisedBlob);
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 300 - (Date.now() - now))));
      setNoiseUrl(noisedUrl);
      setNoisePath(noisedPath);
      setNoiselessTip("点击“降噪”以去噪")
      setNoiselessUrl(null);

    } catch (error) {
      if (error === false) return;
      alert("添加噪音失败: " + (error as any).toString());
    }
  }

  async function denoise() {
    if (noiselesser === 'fir') {
      try {
        setNoiselessUrl(null);
        setNoiselessTip("加载音频中...")
        const denoisePromise: Promise<[number[], string]> = invoke('denoise', { noisePath, noiselesser, range }).catch((error) => {
          alert("降噪失败: " + (error as any).toString());
          throw false;
        }) as Promise<[number[], string]>;
        await noiseless.current.wait('noise_loaded');
        setNoiselessTip("生成滤波器中...")
        await noiseless.current.wait('filter_generated');
        setNoiselessTip("应用滤波器中...")
        await noiseless.current.wait('filter_applied');
        setNoiselessTip("降噪中...")
        await noiseless.current.wait('denoised');
        setNoiselessTip("保存音频中...")
        const [denoisedData, _denoisedPath] = await denoisePromise;
        setNoiselessTip("降噪完毕")
        const denoisedBlob = new Blob([new Uint8Array(denoisedData)], { type: 'audio/wav' });
        const denoisedUrl = URL.createObjectURL(denoisedBlob);
        setNoiselessUrl(denoisedUrl);
        setNoiselessTip("降噪完成")
      } catch (error) {
        if (error === false) return;
        alert("降噪失败: " + (error as any).toString());
      }
    } else {
      setNoiselessUrl(null);
      setNoiselessTip("处理中...")
      const [denoisedData, _denoisedPath] = await invoke('denoise', { noisePath, noiselesser, range: [0, 0] }).catch((error) => {
        alert("降噪失败: " + (error as any).toString());
        throw false;
      }) as [number[], string];
      const denoisedBlob = new Blob([new Uint8Array(denoisedData)], { type: 'audio/wav' });
      const denoisedUrl = URL.createObjectURL(denoisedBlob);
      setNoiselessUrl(denoisedUrl);
    }
  }

  return (
    <>
      <div className="h-[calc(100vh-20px)] w-screen flex flex-col space-y-4 p-4 pb-0">
        <div className='grid grid-cols-10 h-[28.5714286%] hover:shadow-around rounded-lg transition-all relative border-[0.5px] border-gray-200 hover:border-white'>
          <h2 className='absolute text-xl font-extralight top-2 left-2 text-gray-400'>
            输入
          </h2>
          <div className='h-full flex justify-center items-center col-span-5'>
            <div className='my-auto'>
              <Recorder onRecorded={transcode} />
            </div>
          </div>
          <div className='h-full col-span-5'>
            <div className='flex flex-col justify-center h-full'>
              <AudioPlayer
                src={recordingUrl}
                title="录音"
                onUpload={async (url) => {
                  setRecordingTip("加载音频中...")
                  const path = await save(url);
                  setWavPath(path);
                  setRecordingUrl(url);
                  setNoiseTip("点击“加噪”以添加噪音")
                  setNoiseUrl(null);
                  setNoiselessUrl(null);
                  setNoiselessTip("请完成前置步骤");
                  return true;
                }}
                uploadTip={recordingTip}
                onClose={() => {
                  setRecordingUrl(null);
                  setRecordingTip("请录音或上传音频文件");

                  setNoiseUrl(null);
                  setNoiseTip("选择噪音文件");
                  setNoisePath(null);

                  setNoiselessUrl(null);
                  setNoiselessTip("请完成前置步骤");
                  setWavPath(null);
                }}
              />
            </div>
          </div>
        </div>

        <div className='grid grid-cols-10 h-[28.5714286%] hover:shadow-around rounded-lg transition-all relative border-[0.5px] border-gray-200 hover:border-white'>
          <div className='h-full flex justify-center items-center col-span-5'>
            <h2 className='absolute text-xl font-extralight top-2 left-2 text-gray-400'>
              加噪
            </h2>
            <div className='my-auto space-y-2 w-[60%]'>
              <form className='space-y-2' onSubmit={(e: React.FormEvent) => {
                e.preventDefault();
                addNoise();
              }}>
                <Label htmlFor="snr">信噪比 (dB)</Label>
                <Input
                  id="snr"
                  defaultValue={snr}
                  onChange={(event) => {
                    setSnr(parseInt(event.target.value));
                  }}
                  type={'number'}
                  min={1}
                  max={100}
                />
                <Button disabled={!wavPath} className='w-full'>加噪</Button>
              </form>
            </div>
          </div>
          <div className='h-full col-span-5'>
            <div className='flex flex-col justify-center h-full'>
              <AudioPlayer
                src={noiseUrl}
                title="加噪"
                uploadTip={noiseTip}
                onClose={() => {
                  setNoiseUrl(null);
                  setNoiseTip(wavPath ? "点击“加噪”以添加噪音" : "请完成前置步骤");
                  setNoiselessTip("请完成前置步骤");
                  setNoiselessUrl(null);
                  setNoisePath(null);
                }}
                onUpload={async (url: string) => {
                  setNoiseTip("加载音频中...")
                  const path = await save(url);
                  setNoiseUrl(url);
                  setRecordingTip("请录音或上传音频文件");
                  setRecordingUrl(null);
                  setWavPath(null);
                  setNoisePath(path);
                  setNoiselessUrl(null);
                  setNoiselessTip("点击“降噪”以去噪")
                  return true;
                }}
              />
            </div>
          </div>
        </div>

        <div className='grid grid-cols-10 h-[42.8571429%] hover:shadow-around rounded-lg transition-all relative border-[0.5px] border-gray-200 hover:border-white'>
          <div className='h-full flex justify-center items-center col-span-5'>
            <h2 className='absolute text-xl font-extralight top-2 left-2 text-gray-400'>
              降噪
            </h2>
            <div className='my-auto w-[60%]'>
              <form className='space-y-2' onSubmit={(e: React.FormEvent) => {
                e.preventDefault();
                denoise();
              }}>
                <div>
                  <Label htmlFor="noiseless">降噪器</Label>
                  <Select defaultValue='fir' onValueChange={(value) => {
                    setNoiselesser(value);
                  }}>
                    <SelectTrigger className="w-full" id="noiseless">
                      <SelectValue placeholder="选择降噪器" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>滤波器</SelectLabel>
                        <SelectItem value="fir">有限冲激响应（FIR）</SelectItem>
                        <SelectLabel>神经网络</SelectLabel>
                        <SelectItem value="rnn">循环神经网络（RNN）</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                {noiselesser === 'fir' && <div>
                  <Label htmlFor="range">带通滤波器范围（Hz）</Label>
                  <div className='grid grid-cols-2 gap-2'>
                    <Input
                      id="range"
                      defaultValue={range[0]}
                      onChange={(event) => {
                        setRange([parseInt(event.target.value), range[1]]);
                      }}
                      type={'number'}
                      min={0}
                      max={range[1]}
                    />
                    <Input
                      id="range2"
                      defaultValue={range[1]}
                      onChange={(event) => {
                        setRange([range[0], parseInt(event.target.value)]);
                      }}
                      type={'number'}
                      min={range[0]}
                    />
                  </div>
                </div>}
                <Button disabled={!noisePath} className='w-full'>降噪</Button>
              </form>
            </div>
          </div>
          <div className='h-full col-span-5'>
            <div className='flex flex-col justify-center h-full'>
              <AudioPlayer
                src={noiselessUrl}
                title="降噪"
                tip={noiselessTip}
                onClose={() => {
                  setNoiselessUrl(null);
                  setNoiselessTip("点击“降噪”以去噪");
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <footer className='text-center text-gray-400 text-[8px] h-[12px] my-[4px]'>
        © 2024 <a href="https://github.com/YouXam" target='_blank'>YouXam</a>
      </footer>
    </>
  );
};

export default App;