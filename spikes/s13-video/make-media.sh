#!/bin/sh
# Спайк S13: материал для замеров синхронизации видео со звуком.
#
# Замысел: вспышка кадра и щелчок в звуке стоят на ОДНОЙ метке времени.
# Тогда картинку и звук можно сверять между собой, а не только каждое
# со своими часами — а именно этого требует проверка «губы совпадают».
#
# Щелчок — синус 3000 Гц длиной 20 мс в начале каждой секунды.
# Вспышка — один белый кадр в начале каждой секунды.
#
# ffmpeg 8.1.1 (проверено 2026-08-12).

set -e
cd "$(dirname "$0")"

# —— 3 секунды, тепличное сжатие: для проверки «звук вынимается из mp4» ——
# crf 0, чтобы одиночная вспышка не размазалась сжатием.
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "color=c=black:s=320x240:r=30:d=3" \
  -f lavfi -i "aevalsrc='if(lt(mod(t\,1)\,0.02)\,0.7*sin(3000*2*PI*t)\,0)':s=48000:d=3" \
  -vf "geq=lum='if(lt(mod(T\,1)\,0.034)\,255\,0)':cb=128:cr=128" \
  -c:v libx264 -crf 0 -pix_fmt yuv420p -g 30 -c:a aac -shortest flash-3s.mp4

# —— 60 секунд, НАГРУЖЕННОЕ видео: для замера дрейфа и плавности ——
# Фон из testsrc2 притушен до 30 %, чтобы вспышка (255) отличалась уверенно.
# Без нагрузки чёрный кадр сжимается в 26 кбит/с, и декодеру нечего делать —
# замер плавности на таком материале был бы тепличным.
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=60" \
  -f lavfi -i "aevalsrc='if(lt(mod(t\,1)\,0.02)\,0.7*sin(3000*2*PI*t)\,0)':s=48000:d=60" \
  -vf "geq=lum='if(lt(mod(T\,1)\,0.034)\,255\,0.30*lum(X\,Y))':cb=128:cr=128" \
  -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -g 60 -c:a aac -b:a 128k \
  -shortest flash-60s-busy.mp4

ffprobe -v error -show_entries format=duration,bit_rate -of default=noprint_wrappers=1 flash-60s-busy.mp4
