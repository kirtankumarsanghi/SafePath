# Bundled OCR language data

`eng.traineddata.gz` is the English LSTM model distributed by `@tesseract.js-data/eng@1.0.0`, in its `4.0.0_best_int` directory.

Source: https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz

Upstream project: https://github.com/tesseract-ocr/tessdata
License: Apache License 2.0. See https://github.com/tesseract-ocr/tessdata/blob/main/LICENSE

Bundling this file allows server-side OCR without downloading language data from a CDN for each upload.
