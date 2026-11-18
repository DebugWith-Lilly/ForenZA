import sys
from faster_whisper import WhisperModel

def main():
    if len(sys.argv) < 2:
        print("No audio file supplied.", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]

    # Load Whisper locally on the laptop.
    # The small model offers a useful balance of speed and accuracy.
    model = WhisperModel(
        "small",
        device="cpu",
        compute_type="int8"
    )

    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=True
    )

    transcript = " ".join(
        segment.text.strip()
        for segment in segments
        if segment.text.strip()
    )

    print(transcript)


if __name__ == "__main__":
    main()