"""
Servidor local de efeitos sonoros do Lopes.Film (Stable Audio Open 1.0, Stability AI).

    Instalar uma vez:   python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
                        (PyTorch com CUDA: https://pytorch.org/get-started/locally/)
    Licença do modelo:  aceite em https://huggingface.co/stabilityai/stable-audio-open-1.0 e entre com `huggingface-cli login`
    Rodar:              INICIAR.bat   (ou: .venv\Scripts\python server.py)   -> http://127.0.0.1:8002

    GET  /health                       {"ok": true}
    POST /generate {prompt, seconds}   -> audio/wav

Numa placa de 6 GB usa offload para a CPU (mais lento, cabe). Sons de até 47 s; para efeitos 2 a 8 s bastam.
"""
import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch
from diffusers import StableAudioPipeline

MODEL = os.environ.get("LOPESFILM_SFX_MODEL", "stabilityai/stable-audio-open-1.0")
PORT = int(os.environ.get("LOPESFILM_SFX_PORT", "8002"))
STEPS = int(os.environ.get("LOPESFILM_SFX_STEPS", "100"))

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32
print(f"Carregando {MODEL} em {device}...", flush=True)
pipe = StableAudioPipeline.from_pretrained(MODEL, torch_dtype=dtype)
if device == "cuda":
    pipe.enable_model_cpu_offload()  # cabe em 6 GB
rate = pipe.vae.sampling_rate
print("Pronto em http://127.0.0.1:%d" % PORT, flush=True)


def wav(samples: np.ndarray, sr: int) -> bytes:
    import wave
    pcm = (np.clip(samples.T, -1, 1) * 32767).astype("<i2")
    out = io.BytesIO()
    with wave.open(out, "wb") as f:
        f.setnchannels(pcm.shape[1])
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(pcm.tobytes())
    return out.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, kind: str = "application/json"):
        self.send_response(code)
        self.send_header("content-type", kind)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, b'{"ok":true}')
        self._send(404, b'{"error":"not found"}')

    def do_POST(self):
        if self.path != "/generate":
            return self._send(404, b'{"error":"not found"}')
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
            prompt = str(data.get("prompt", "")).strip()
            if not prompt:
                return self._send(400, b'{"error":"prompt is empty"}')
            seconds = max(1.0, min(float(data.get("seconds", 5)), 47.0))
            gen = torch.Generator(device).manual_seed(int(data.get("seed", torch.seed() % 2**31)))
            audio = pipe(prompt, negative_prompt="low quality, average quality", num_inference_steps=int(data.get("steps", STEPS)),
                         audio_end_in_s=seconds, num_waveforms_per_prompt=1, generator=gen).audios[0]
            self._send(200, wav(audio.float().cpu().numpy(), rate), "audio/wav")
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            self._send(507, json.dumps({"error": "out of GPU memory: try a shorter sound"}).encode())
        except Exception as e:  # noqa: BLE001
            self._send(500, json.dumps({"error": str(e)}).encode())

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
