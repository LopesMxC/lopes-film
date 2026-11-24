"""Lopes.Film voice clean-up: room echo taken down, then noise taken out by a neural model. By Lopes.

    python voiceclean.py IN.wav OUT.wav [--dereverb off|light|medium|strong] [--denoise off|light|medium|strong]

IN is a 48 kHz mono wav (ffmpeg makes it, with the hum and the rumble already cut). Two passes:

1. Echo (late reverberation): the reverb still ringing from what was said a moment ago is estimated from the sound
   itself (its power, a little earlier, decayed as a room of the chosen size would decay it) and taken out of each
   frequency, with a floor so the voice is never hollowed (Lebart's single-channel method).
2. Noise: DeepFilterNet 3 (Hendrik Schröter, MIT / Apache-2.0), a model made for speech, which takes out fans, traffic,
   hiss and voices in the background while keeping the voice whole. `light` and `medium` limit how far it goes.

Prints one line of JSON: what was done.
"""
import argparse
import json
import sys

import numpy as np
import soundfile as sf
from scipy.signal import istft, stft

# echo: [how long the room rings (RT60, s), lowest gain (dB)]
ECHO = {'light': (0.5, -10.0), 'medium': (0.8, -16.0), 'strong': (1.1, -22.0)}
# noise: how far the model may take it down (dB); None: as far as it judges
NOISE = {'light': 12.0, 'medium': 24.0, 'strong': None}


def dereverb(x, sr, rt60, floor_db, late_ms=50.0):
    n, hop = 1024, 256
    _, _, X = stft(x, sr, nperseg=n, noverlap=n - hop)
    P = np.abs(X) ** 2
    S = np.copy(P)
    for k in range(1, S.shape[1]):
        S[:, k] = 0.6 * S[:, k - 1] + 0.4 * P[:, k]
    d = max(1, int(round(late_ms / 1000 * sr / hop)))
    decay = np.exp(-2 * (3 * np.log(10) / rt60) * d * hop / sr)
    L = np.zeros_like(S)
    L[:, d:] = decay * S[:, :-d]
    G = np.maximum(1 - L / (S + 1e-12), 10 ** (floor_db / 20))
    for k in range(1, G.shape[1]):
        G[:, k] = 0.5 * G[:, k] + 0.5 * G[:, k - 1]
    _, y = istft(X * G, sr, nperseg=n, noverlap=n - hop)
    return y[: len(x)]


def denoise(x, sr, limit):
    import torch
    from df.enhance import enhance, init_df

    model, state, _ = init_df(log_level='ERROR')
    t = torch.from_numpy(x.astype(np.float32))[None]
    if sr != state.sr():
        import torchaudio
        t = torchaudio.functional.resample(t, sr, state.sr())
    y = enhance(model, state, t, atten_lim_db=limit)
    return y[0].numpy(), state.sr()


def main():
    a = argparse.ArgumentParser()
    a.add_argument('src')
    a.add_argument('out')
    a.add_argument('--dereverb', default='off')
    a.add_argument('--denoise', default='medium')
    o = a.parse_args()
    x, sr = sf.read(o.src, always_2d=True)
    x = x.mean(axis=1)
    peak = float(np.max(np.abs(x))) or 1.0
    done = []
    if o.dereverb in ECHO:
        rt60, floor_db = ECHO[o.dereverb]
        x = dereverb(x, sr, rt60, floor_db)
        done.append(f'echo:{o.dereverb}')
    if o.denoise in NOISE:
        # the model hears best at a full level: brought up to it first, put back after
        x = x / (float(np.max(np.abs(x))) or 1.0) * 0.9
        x, sr = denoise(x, sr, NOISE[o.denoise])
        done.append(f'noise:{o.denoise}')
    # back to the level it came in at, never clipped
    x = x / (float(np.max(np.abs(x))) or 1.0) * min(peak, 0.98)
    sf.write(o.out, x, sr, subtype='PCM_16')
    print(json.dumps({'ok': True, 'done': done, 'sr': sr, 'seconds': round(len(x) / sr, 2)}))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # the app shows this line
        print(json.dumps({'ok': False, 'error': f'{type(e).__name__}: {e}'}))
        sys.exit(1)
