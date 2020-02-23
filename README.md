# Native HLS Extension

Allows HLS playback in chrome and firefox browsers

# Usage

1. goto chrome://extensions/
2. enable developer mode
3. click load unpacked button
4. select this folder
5. disable developer mode


# Some Developer Notes 

By default, the browser downloads any m3u8 files that were requested. This plugin checks any links to see if they are m3u8.
If that's the case, it opens a new tab on a video player that uses the [hlsjs][] library. This extension is just a wrapper of [hlsjs][] for chrome.

[hlsjs]: https://github.com/dailymotion/hls.js

#License
Released under [Apache 2.0 License](LICENSE)

