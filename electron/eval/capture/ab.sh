#!/bin/zsh
# Mic processing A/B through the real capture code (free): each variant × clean/babble, then whisper.cpp + WER.
#   eval/capture/ab.sh <dir with clean.wav, babble.wav, ref.txt>
S=$1; cd ${0:a:h}/../..; unset ELECTRON_RUN_AS_NODE
typeset -A V=(all-on 1,1,1 ns-off 1,0,1 agc-off 1,1,0 ns-agc-off 1,0,0 all-off 0,0,0)
for n f in ${(kv)V}; for c in clean babble; ./node_modules/.bin/electron eval/capture/main.cjs $S/$c.wav $S/$c-$n.wav 42 $f >/dev/null 2>&1 &
wait
for w in $S/clean.wav $S/babble.wav $S/*-*.wav; whisper-cli -m ~/whisper.cpp/models/ggml-base.en.bin -f $w -nt -np 2>/dev/null > ${w%.wav}.txt
node eval/capture/wer.mjs $S/ref.txt $S/clean.txt $S/babble.txt $S/*-*.txt
for w in $S/*-*.wav; echo "${w:t} $(ffmpeg -hide_banner -i $w -af volumedetect -f null - 2>&1 | grep -oE '(mean|max)_volume: [-0-9.]+ dB' | tr '\n' ' ')"
