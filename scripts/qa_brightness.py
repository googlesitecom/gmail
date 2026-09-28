#!/usr/bin/env python3
"""Objective brightness measurement of QA screenshots."""
import sys
from PIL import Image
import numpy as np

for path in sys.argv[1:]:
    img = np.asarray(Image.open(path).convert('L'), dtype=np.float32)
    h, w = img.shape
    # central band (track area) and full image
    center = img[h//4:3*h//4, w//4:3*w//4]
    print(f"{path.split('/')[-1]}: full={img.mean():.0f} center={center.mean():.0f} p95={np.percentile(img,95):.0f}")
