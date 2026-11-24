"""Lopes.Film: fast local transcription. faster-whisper (CTranslate2) on the graphics card when there is one
(CUDA, float16), else on every core of the processor (int8). Each word timed.

    python whisperfast.py IN.wav MODEL        MODEL: large-v3-turbo, small, ...

Prints one line of JSON: {"ok": true, "chunks": [{"text", "timestamp": [start, end]}], "language", "device"},
or {"ok": false, "error"} (exit 1). Author: Lopes.
"""
import glob
import json
import os
import sys


def cuda_libraries():
    """cuBLAS and cuDNN as pip installs them (nvidia-*-cu12): made findable before CTranslate2 loads."""
    try:
        import nvidia  # noqa: F401
    except ImportError:
        return
    for base in getattr(sys.modules['nvidia'], '__path__', []):
        for lib in glob.glob(os.path.join(base, '*', 'bin')) + glob.glob(os.path.join(base, '*', 'lib')):
            if sys.platform == 'win32':
                try:
                    os.add_dll_directory(lib)
                except OSError:
                    pass
            os.environ['PATH'] = lib + os.pathsep + os.environ.get('PATH', '')
            if sys.platform.startswith('linux'):
                import ctypes
                for so in sorted(glob.glob(os.path.join(lib, 'lib*.so*'))):
                    try:
                        ctypes.CDLL(so, mode=ctypes.RTLD_GLOBAL)
                    except OSError:
                        pass


def run(src, name, device):
    from faster_whisper import WhisperModel
    import ctranslate2
    if device == 'cuda':
        model = WhisperModel(name, device='cuda', compute_type='float16')
        beam = 5
    else:
        cores = max(1, os.cpu_count() or 1)
        model = WhisperModel(name, device='cpu', compute_type='int8', cpu_threads=cores)
        beam = 1
    segments, info = model.transcribe(src, word_timestamps=True, vad_filter=True, beam_size=beam,
                                      condition_on_previous_text=False)
    chunks = []
    for seg in segments:  # the work is done here, as the segments are read
        for w in seg.words or []:
            chunks.append({'text': w.word, 'timestamp': [round(w.start, 3), round(w.end, 3)]})
    return chunks, info.language


def main():
    if len(sys.argv) < 3:
        print(json.dumps({'ok': False, 'error': 'usage: whisperfast.py IN.wav MODEL'}))
        return 1
    src, name = sys.argv[1], sys.argv[2]
    cuda_libraries()
    tried = []
    try:
        import ctranslate2
        gpu = ctranslate2.get_cuda_device_count() > 0
    except Exception:
        gpu = False
    for device in (['cuda', 'cpu'] if gpu else ['cpu']):
        try:
            chunks, language = run(src, name, device)
            print(json.dumps({'ok': True, 'chunks': chunks, 'language': language, 'device': device,
                              **({'tried': tried} if tried else {})}, ensure_ascii=False))
            return 0
        except Exception as e:  # a card without room, or CUDA libraries missing: the processor instead
            tried.append(f'{device}: {e}')
    print(json.dumps({'ok': False, 'error': '; '.join(tried)}, ensure_ascii=False))
    return 1


if __name__ == '__main__':
    sys.exit(main())
