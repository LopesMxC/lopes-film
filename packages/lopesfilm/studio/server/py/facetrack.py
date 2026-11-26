"""Follow a face through a video: facetrack.py IN OUT.json FROM TO

The face is found with MediaPipe's face detector (its model comes in the wheel: nothing to download), every few frames,
the boxes in between taken from a straight line between the two nearest, and the whole path smoothed forward and back
(no lag, no jitter). Written to OUT as the same JSON subject-track makes: per frame its time in the clip and the box
(x, y, w, h, 0 to 1 of the picture) and how sure it was. Prints one JSON line: {ok, frames, found, fps}.
"""
import json
import sys

import cv2
import mediapipe as mp
import numpy as np


def main(src, out, start, end):
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        raise SystemExit('cannot open the video')
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if start > 0:
        cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000.0)
    step = max(1, round(fps / 15.0))
    detector = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)
    limit = max(1, int((end - start) * fps)) if end > start else 10 ** 9
    seen = []  # (frame index, x, y, w, h, score) of the frames a face was found in
    count = 0
    last = None
    while count < limit:
        ok, frame = cap.read()
        if not ok:
            break
        if count % step == 0:
            small = frame
            if frame.shape[1] > 640:
                scale = 640.0 / frame.shape[1]
                small = cv2.resize(frame, (640, max(2, int(frame.shape[0] * scale))), interpolation=cv2.INTER_AREA)
            result = detector.process(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
            boxes = []
            for d in result.detections or []:
                b = d.location_data.relative_bounding_box
                x, y, w, h = max(0.0, b.xmin), max(0.0, b.ymin), min(1.0, b.width), min(1.0, b.height)
                if w > 0.01 and h > 0.01:
                    boxes.append((x, y, w, h, float(d.score[0]) if d.score else 0.5))
            if boxes:
                if last is None:
                    pick = max(boxes, key=lambda b: b[2] * b[3])
                else:
                    # the same face as before: the nearest to where it was, among those not much smaller than the biggest
                    biggest = max(b[2] * b[3] for b in boxes)
                    near = [b for b in boxes if b[2] * b[3] >= 0.3 * biggest]
                    pick = min(near, key=lambda b: (b[0] + b[2] / 2 - last[0]) ** 2 + (b[1] + b[3] / 2 - last[1]) ** 2)
                last = (pick[0] + pick[2] / 2, pick[1] + pick[3] / 2)
                seen.append((count, *pick))
        count += 1
    cap.release()
    if not seen:
        raise SystemExit('no face found in that stretch of the video')
    idx = np.array([s[0] for s in seen], dtype=float)
    data = np.array([s[1:5] for s in seen], dtype=float)
    scores = np.array([s[5] for s in seen], dtype=float)
    every = np.arange(count, dtype=float)
    # in between and beyond: a straight line between detections, held at both ends
    track = np.stack([np.interp(every, idx, data[:, k]) for k in range(4)], axis=1)
    sure = np.interp(every, idx, scores)
    gap = np.array([np.min(np.abs(idx - i)) for i in every])
    sure = np.where(gap > step * 3, sure * 0.3, sure)

    def ema(a, alpha=0.35):
        o = a.copy()
        for i in range(1, len(o)):
            o[i] = alpha * a[i] + (1 - alpha) * o[i - 1]
        return o

    # forward and back: smooth, and without the delay one direction alone leaves
    for k in range(4):
        track[:, k] = ema(ema(track[:, k])[::-1])[::-1]
    frames = []
    for i in range(count):
        x, y, w, h = track[i]
        frames.append({'t': round(start + i / fps, 4), 'x': round(float(x), 4), 'y': round(float(y), 4),
                       'w': round(float(w), 4), 'h': round(float(h), 4), 'sure': round(float(sure[i]), 3)})
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'src': src, 'fps': fps, 'width': width, 'height': height, 'from': start, 'frames': frames}, f, indent=1)
    print(json.dumps({'ok': True, 'frames': len(frames), 'found': len(seen), 'fps': fps}))


if __name__ == '__main__':
    a = sys.argv
    main(a[1], a[2], float(a[3]) if len(a) > 3 else 0.0, float(a[4]) if len(a) > 4 else 0.0)
