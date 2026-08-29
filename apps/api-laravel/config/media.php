<?php

return [
    'max_image_bytes' => env('MEDIA_MAX_IMAGE_BYTES', 10 * 1024 * 1024),
    'max_video_bytes' => env('MEDIA_MAX_VIDEO_BYTES', 200 * 1024 * 1024),
];
