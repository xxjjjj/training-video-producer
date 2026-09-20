# Third-party notices

This package integrates HyperFrames as an unmodified npm dependency and adapts selected composition/animation contract guidance and the minimal HTML scaffold.

- Upstream: HeyGen / https://github.com/heygen-com/hyperframes
- Version: 0.8.42; source commit 71b274bbfdfce9080d8a25e4ad096bfcfab6ef4c
- License: Apache License 2.0, included in licenses/HyperFrames-Apache-2.0.txt.
- Modified/adapted files: references/hyperframes.md and assets/composition-starter.html. The wrapper, scene mapping, training workflow and package entry point are local integration code; this is not an official HeyGen skill distribution or endorsement.

Runtime dependencies (including GSAP, FFmpeg binaries, Playwright and their transitive dependencies) retain their own licenses in installed npm packages. GSAP is installed from npm and copied into produced projects with its original header; its own license remains applicable. No proprietary credentials, course media, voice samples or model weights are included in the distribution ZIP. See package-lock.json for exact dependency resolutions.

## License scope and distribution

Original project code and documentation: Apache-2.0 (LICENSE and NOTICE).
This does not relicense upstream dependencies. The public ZIP contains the
skill source, examples, license texts and dependency lock, not node_modules,
browsers, FFmpeg binaries, font files, voice samples or speech-model weights.

| Component | Pinned version | License / official source |
| --- | --- | --- |
| HyperFrames | 0.8.42 | Apache-2.0; https://github.com/heygen-com/hyperframes |
| GSAP | 3.14.2 | GSAP Standard No Charge License; https://gsap.com/community/standard-license/ |
| Playwright | 1.63.0 | Apache-2.0; https://github.com/microsoft/playwright |
| ffmpeg-static package | 5.3.0 | GPL-3.0-or-later package declaration; https://github.com/eugeneware/ffmpeg-static |
| ffprobe-static wrapper | 3.1.0 | MIT wrapper; https://github.com/joshwnj/ffprobe-static |

FFmpeg/ffprobe binaries have licenses determined by their actual builds;
the wrapper's license does not replace the binary's license. If redistributing
runtime binaries or an offline bundle, inspect that build's notices and meet
applicable license and corresponding-source obligations:
https://ffmpeg.org/legal.html . This source-only ZIP is not an offline bundle.

GSAP's license permits AI-generated GSAP code and commercial usage, but has
restrictions concerning competing visual animation builders. Preserve GSAP's
original proprietary headers in exported HTML projects; do not describe it as
Apache-2.0. New fonts, images, music, models and footage added by users require
their own applicable rights. MiniMax is an external paid service, not a model
or quota supplied under this project's license.
