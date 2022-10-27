////////////////////////////////////////////
// 7 segments display OCR
// Copyright (C) 2021  Artur Augusto Martins

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.


////////////////////////////////////////////
// Globals
////////////////////////////////////////////
let CONF = {
  x0: 40,
  y0: 40,
  x1: 300,
  y1: 150,
  padLeft: 0,
  padTop: 0,
  format: '8.8.8.8',
  gap: 20,
  tickWidth: 10,
  tickHeight: 13,
  digitHeigth: 80,
  digitWidth: 60,
  skew: 0,
  vskew: 0,
  detectThresh: 0.2,
}

let readBuf = [undefined, undefined]

const selCanvas = document.getElementById('selCanvas')
const selCtx = selCanvas.getContext('2d')

const segmentedCanvas = document.getElementById('segmentedCanvas')
const segmentedCanvasCtx = segmentedCanvas.getContext('2d')

const maskCanvas = document.getElementById('maskCanvas')
const maskCtx = maskCanvas.getContext('2d')


const videoElement = document.querySelector('video');
// const audioSelect = document.querySelector('select#audioSource');

const videoSelect = document.querySelector('select#videoSource');

let roiNorm = [0,0,0,0]

////////////////////////////////////////////
// Controls
////////////////////////////////////////////

const getURLParameters = url => url.match(/([^?=&]+)(=([^&]*))/g).reduce(
  (a, v) => {
    let key = v.slice(0, v.indexOf('='))
    let val = v.slice(v.indexOf('=') + 1)
    let valParsed
    
    if (val === 'true') {
      valParsed = true
    } else if (val === 'false') {
      valParsed = false
    } else if (key === 'format') {
      valParsed = val
    } else {
      valParsed = parseFloat(val)
    }

    if (key === 'invert') {
      document.getElementById('invert').checked = valParsed
    } else {
      let element = document.getElementById(key)
      console.log(element, key)
      if (element) {
        element.value = valParsed
      }
    }

    a[key] = valParsed
    return a
  }, {}
);

var urlParams = {}
if (window.location.search) {
  urlParams = getURLParameters(window.location.href)
}

Object.assign(CONF, urlParams)

console.log(CONF)

const genPermalink = function() {
  
  let permalinkInputElement = document.getElementById('permalinkInput')
  permalinkInputElement.value = window.location.origin + window.location.pathname + 
  '?x0=' + CONF.x0 +
  '&x1=' + CONF.x1 +
  '&y0=' + CONF.y0 +
  '&y1=' + CONF.y1 +
  '&invert=' + document.getElementById('invert').checked +
  '&gamma=' + document.getElementById('gamma').value +
  '&skew=' + document.getElementById('skew').value +
  '&vskew=' + document.getElementById('vskew').value +
  '&gap=' + document.getElementById('gap').value +
  '&format=' + document.getElementById('format').selectedOptions[0].value +
  '&interval=' + document.getElementById('interval').value
  

  ;console.log(permalinkInputElement.value)
}

function moveTopUp() {CONF.y0 -= 1 ; genPermalink()}
function moveTopDown() {CONF.y0 += 1 ; genPermalink()}

function moveLeftLeft() {CONF.x0 -= 1 ; genPermalink()}
function moveLeftRight() {CONF.x0 += 1 ; genPermalink()}

function moveRightLeft() {CONF.x1 -= 1 ; genPermalink()}
function moveRightRight() {CONF.x1 += 1 ; genPermalink()}

function moveBottomUp() {CONF.y1 -= 1 ; genPermalink()}
function moveBottomDown() {CONF.y1 += 1 ; genPermalink()}

function changeDisplayFormat(element) {CONF.format = element.selectedOptions[0].value ; genPermalink()}


genPermalink();
////////////////////////////////////////////
// OCR engine
////////////////////////////////////////////

const ocr = () => {
  let t1 = new Date();
  
  let maskImg = maskCtx.createImageData(maskCanvas.width, maskCanvas.height)
  let maskImgData = maskImg.data;

  let segmentedCanvasImg = segmentedCanvasCtx.getImageData(0, 0, segmentedCanvas.width, segmentedCanvas.height)
  let segmentedCanvasImgData = segmentedCanvasImg.data;

  const drawPixel = (x, y, color) => {
    let roundedX = Math.round(x);
    let roundedY = Math.round(y);

    let index = 4 * (maskCanvas.width * roundedY + roundedX);

    maskImgData[index + 0] = color.r;
    maskImgData[index + 1] = color.g;
    maskImgData[index + 2] = color.b;
    maskImgData[index + 3] = color.a;
  }

  const getPixel = (x, y) => {
    let roundedX = Math.round(x);
    let roundedY = Math.round(y);
    let index = 4 * (segmentedCanvas.width * roundedY + roundedX);
    return Boolean(segmentedCanvasImgData[index + 0])
  }

  const drawSeg = (x, y, width, height) => {
    let roiWidth = roiNorm[2] - roiNorm[0]
    let roiHeight = roiNorm[3] - roiNorm[1]

    let segBuff = []
    let segIsOn = false
    let color = null

    // loop all pixels two times, 
    // first to get segment state
    // second to draw detected region
    for (let ocasion = 0; ocasion < 2; ocasion++) {
      for (let j = y; j < y+height-1; j++) {
        for (let i = x; i < x+width-1; i++) {
          let jSkew = j - i*Math.sin(-CONF.vskew/180*Math.PI)
          let iSkew = i - j*Math.sin(-CONF.skew/180*Math.PI)
          if (ocasion === 1) {
            drawPixel(iSkew, jSkew, color)
          } else {
            segBuff.push(getPixel(iSkew, jSkew))
          }
        }
      }

      // return early on second loop, when
      // segment is detected
      if (ocasion === 1) return segIsOn ? 1 : 0
      
      // detect segment
      let segBuffOnCount = 0
      for (let i = segBuff.length - 1; i >= 0; i--) {
        if (segBuff[i]) segBuffOnCount++
      }
      segIsOn = (segBuffOnCount/segBuff.length) < (1-CONF.detectThresh)
      
      if (segIsOn) {
        color = {r: 0, g: 255, b: 0, a: 90}
      } else {
        color = {r: 250, g: 0, b: 0, a: 90}
      }
    }
    return 0
  }

  swapBuffer = () => {
    maskCtx.putImageData(maskImg, 0, 0)
  }

  let output = CONF.format.split('').reduce((a, digitTemplate) => {

    const verticalX = CONF.padLeft + CONF.digitWidth/2 - CONF.tickWidth/2 + CONF.digitWidth * a.i + CONF.gap * a.i
    const verticalXPrev = CONF.padLeft + CONF.digitWidth/2 - CONF.tickWidth/2 + CONF.digitWidth * (a.i-1) + CONF.gap * (a.i-1)
    
    const horizontalLeftX = CONF.padLeft + CONF.digitWidth * a.i + CONF.gap * a.i
    const horizontalLeftY = CONF.padTop + CONF.digitHeigth/3 - CONF.tickWidth/2
    
    const bottomY = CONF.padTop + (CONF.digitHeigth - CONF.digitHeigth/3) - CONF.tickWidth/2
    const horizontalRightX = CONF.padLeft + CONF.digitWidth - CONF.tickHeight + CONF.digitWidth * a.i + CONF.gap * a.i

    const drawTopSegment = () => {
      return drawSeg(
        verticalX,
        CONF.padTop,
        CONF.tickWidth,
        CONF.tickHeight,
      )
    }

    const drawCenterSegment = () => {
      return drawSeg(
        verticalX,
        CONF.padTop + CONF.digitHeigth/2 - CONF.tickHeight/2,
        CONF.tickWidth,
        CONF.tickHeight,
      )
    }

    const drawBottomSegment = () => {
      return drawSeg(
        verticalX,
        CONF.padTop + CONF.digitHeigth - CONF.tickHeight,
        CONF.tickWidth,
        CONF.tickHeight,
      )
    }

    const drawLeftTopSegment = () => {
      return drawSeg(
        horizontalLeftX,
        horizontalLeftY,
        CONF.tickHeight,
        CONF.tickWidth,
      )
    }
    
    const drawLeftBottomSegment = () => {
      return drawSeg(
        horizontalLeftX,
        bottomY,
        CONF.tickHeight,
        CONF.tickWidth,
      )
    }

    const drawRightTopSegment = () => {
      return drawSeg(
        horizontalRightX,
        horizontalLeftY,
        CONF.tickHeight,
        CONF.tickWidth,
      )
    }

    const drawRightBottomSegment = () => {
      return drawSeg(
        horizontalRightX,
        bottomY,
        CONF.tickHeight,
        CONF.tickWidth,
      )
    }

    const drawDot = () => {
      return drawSeg(
        (verticalX+verticalXPrev)/2,
        CONF.padTop + CONF.digitHeigth - CONF.tickHeight/2,
        CONF.tickWidth,
        CONF.tickHeight/2,
      )
    }

    const digitsTemplateMap = Object({
      '8': () => {
        let res = [
          drawTopSegment(),
          drawLeftTopSegment(),
          drawRightTopSegment(),
          drawCenterSegment(),
          drawLeftBottomSegment(),
          drawRightBottomSegment(),
          drawBottomSegment()
        ];
        a.i = a.i+1
        
        if            (!res[0] && 
              !res[1] &&           !res[2] && 
                        res[3] && 
              !res[4] &&           !res[5] && 
                        !res[6]) return '-'

        if            (res[0] && 
              res[1] &&           res[2] && 
                        !res[3] && 
              res[4] &&           res[5] && 
                        res[6]) return '0'
        
        if            (!res[0] && 
              !res[1] &&           res[2] && 
                        !res[3] && 
              !res[4] &&           res[5] && 
                        !res[6]) return '1'

        if            (res[0] && 
              !res[1] &&           res[2] && 
                        res[3] && 
              res[4] &&           !res[5] && 
                        res[6]) return '2'

        if            (res[0] && 
              !res[1] &&           res[2] && 
                        res[3] && 
              !res[4] &&           res[5] && 
                        res[6]) return '3'

        if            (!res[0] && 
              res[1] &&           res[2] && 
                        res[3] && 
              !res[4] &&           res[5] && 
                        !res[6]) return '4'

        if            (res[0] && 
              res[1] &&           !res[2] && 
                        res[3] && 
              !res[4] &&           res[5] && 
                        res[6]) return '5'

        if            (res[0] && 
              res[1] &&           !res[2] && 
                        res[3] && 
              res[4] &&           res[5] && 
                        res[6]) return '6'

        if            (!res[0] && 
              res[1] &&           !res[2] && 
                        res[3] && 
              res[4] &&           res[5] && 
                        res[6]) return '6'
        
        if            (res[0] && 
              res[1] &&           res[2] && 
                        !res[3] && 
              !res[4] &&           res[5] && 
                        !res[6]) return '7'
        
        if            (res[0] && 
              !res[1] &&           res[2] && 
                        !res[3] && 
              !res[4] &&           res[5] && 
                        !res[6]) return '7'

        if            (res[0] && 
              res[1] &&           res[2] && 
                        res[3] && 
              res[4] &&           res[5] && 
                        res[6]) return '8'

        if            (res[0] && 
              res[1] &&           res[2] && 
                        res[3] && 
              !res[4] &&           res[5] && 
                        res[6]) return '9'

        if            (res[0] && 
              res[1] &&           res[2] && 
                        res[3] && 
              !res[4] &&           res[5] && 
                        !res[6]) return '9'
        
        if            (!res[0] && 
              !res[1] &&           !res[2] && 
                        !res[3] && 
              !res[4] &&           !res[5] && 
                        !res[6]) return ''

        if            (!res[0] && 
          res[1] &&           !res[2] && 
                    !res[3] && 
          res[4] &&           !res[5] && 
                    res[6]) return 'L'
                                    
                        
        return '?'
      },
      '.': () => {
        let res = drawDot()
        return res ? '.' : ''
      }
    })
    
    a.res += digitsTemplateMap[digitTemplate]()

    return a
  }, {i: 0, res: ''} )
  
  document.getElementById('output').innerText = output.res
  console.log(output.res)

  readBuf.shift()
  readBuf.push(output.res)

  let readBufSet = new Set(readBuf)

  if (readBufSet.size === 1 && output.res.length) {
    let text = output.res + '\t\t'+new Date().toISOString().split('.')[0].replace('T',' ')+'\n'

    if (document.getElementById('startLog').checked) {
      let logOutputEl = document.getElementById('logOutput')
      logOutputEl.value += text
      logOutputEl.scrollTop = logOutputEl.scrollHeight;
    }

    if (document.getElementById('sendWs').checked) {
      new WebSocket(document.getElementById('wsAddr').value).onopen = (evt) => {
        evt.target.send(text)
        evt.target.close()
      }

    }
    
    
  }

  
  

  swapBuffer();

  let t2 = new Date();
  let dt = t2 - t1;

  // console.log('elapsed time = ' + dt + ' ms');

}

////////////////////////////////////////////
// Camera stream stuff
// based on https://github.com/samdutton/simpl/tree/gh-pages/getusermedia/sources
////////////////////////////////////////////

videoSelect.onchange = getStream;
getStream().then(getDevices).then(gotDevices);

function getDevices() {
  // AFAICT in Safari this only gets default devices until gUM is called :/
  return navigator.mediaDevices.enumerateDevices();
}

function gotDevices(deviceInfos) {
  window.deviceInfos = deviceInfos; // make available to console
  console.log('Available input and output devices:', deviceInfos);
  for (const deviceInfo of deviceInfos) {
    const option = document.createElement('option');
    option.value = deviceInfo.deviceId;
    if (deviceInfo.kind === 'audioinput') {
      // option.text = deviceInfo.label || `Microphone ${audioSelect.length + 1}`;
      // audioSelect.appendChild(option);
    } else if (deviceInfo.kind === 'videoinput') {
      option.text = deviceInfo.label || `Camera ${videoSelect.length + 1}`;
      videoSelect.appendChild(option);
    }
  }
}

function getStream() {
  if (window.stream) {
    window.stream.getTracks().forEach(track => {
      track.stop();
    });
  }
  // const audioSource = audioSelect.value;
  const videoSource = videoSelect.value;
  const constraints = {
    // audio: {deviceId: audioSource ? {exact: audioSource} : undefined},
    video: {
      deviceId: videoSource ? {exact: videoSource} : undefined,
      width: { max: 500 }
    }

  };
  return navigator.mediaDevices.getUserMedia(constraints).
    then(gotStream).catch(handleError);
}

function gotStream(stream) {
  window.stream = stream; // make stream available to console
  // audioSelect.selectedIndex = [...audioSelect.options].
  //   findIndex(option => option.text === stream.getAudioTracks()[0].label);
  videoSelect.selectedIndex = [...videoSelect.options].
    findIndex(option => option.text === stream.getVideoTracks()[0].label);
  videoElement.srcObject = stream

  const streamTrack = stream.getVideoTracks()[0];
  const imageCapture = new ImageCapture(streamTrack);
  
  const loop = () => {
    return imageCapture.takePhoto()
      .then(blob => URL.createObjectURL(blob))
      .then(url => {
        let img = new Image();

        roiNorm = [
          Math.min(CONF.x0, CONF.x1),
          Math.min(CONF.y0, CONF.y1),
          Math.max(CONF.x0, CONF.x1),
          Math.max(CONF.y0, CONF.y1)
        ]

        img.onload = () => {
          maskCanvas.width = roiNorm[2] - roiNorm[0]
          maskCanvas.height = roiNorm[3] - roiNorm[1]
          maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height)

          segmentedCanvas.width = roiNorm[2] - roiNorm[0]
          segmentedCanvas.height = roiNorm[3] - roiNorm[1]
          segmentedCanvasCtx.clearRect(0,0,segmentedCanvas.width,segmentedCanvas.height)

          segmentedCanvasCtx.drawImage(img, 
            roiNorm[0], roiNorm[1], roiNorm[2] - roiNorm[0], roiNorm[3] - roiNorm[1],
            0, 0, (roiNorm[2] - roiNorm[0]), (roiNorm[3] - roiNorm[1])
          )

          if (maskCanvas.width * maskCanvas.height > 5) {
            CONF.skew = parseFloat(document.getElementById('skew').value)
            CONF.vskew = parseFloat(document.getElementById('vskew').value)
            CONF.gap = parseFloat(document.getElementById('gap').value)

            CONF.padLeft = Math.abs(maskCanvas.height*Math.sin(-CONF.skew/180*Math.PI))

            // CONF.padTop = (maskCanvas.width/2*Math.sin(-CONF.vskew/180*Math.PI))


            let digitsCount = CONF.format.split('').filter(x => x !== '.').length

            CONF.digitWidth = (maskCanvas.width-CONF.padLeft)/digitsCount - CONF.gap + CONF.gap/digitsCount
            if (CONF.skew > 0) {
              CONF.padLeft -= CONF.padLeft
            }

            CONF.digitHeigth = maskCanvas.height
            
            CONF.padTop = 0
            
            if (CONF.vskew > 0) {
              CONF.digitHeigth = CONF.digitHeigth - Math.abs(maskCanvas.width*Math.sin(CONF.vskew/180*Math.PI))
            }

            if (CONF.vskew < 0) {
              CONF.digitHeigth = CONF.digitHeigth - Math.abs(maskCanvas.width*Math.sin(CONF.vskew/180*Math.PI))
              CONF.padTop = (maskCanvas.width*Math.sin(-CONF.vskew/180*Math.PI))
            }

            
            CONF.tickWidth = CONF.digitHeigth / 20
            CONF.tickHeight = CONF.digitHeigth / 10
            
            preprocess(segmentedCanvasCtx, segmentedCanvas, img, roiNorm)
            ocr()
          }
          
          URL.revokeObjectURL(url)
          return Promise.resolve()
        }
        img.src = url
      })
      .catch(err => {
        console.log(err)
      })
      .finally(() => {
        let interval = parseFloat(document.getElementById('interval').value)
        interval = isNaN(interval) ? 1 : interval
        window.setTimeout(loop, interval)
      })
    ;
  }
  loop()
}

function handleError(error) {
  console.error('Error: ', error);
}

////////////////////////////////////////////
// Selection
////////////////////////////////////////////


var draging = false;
//https://stackoverflow.com/questions/55677/how-do-i-get-the-coordinates-of-a-mouse-click-on-a-canvas-element
function relMouseCoords(event){

  const rect = event.target.getBoundingClientRect()
  const x = event.offsetX || event.layerX
  const y = event.offsetY || event.layerY
  if (event.type === 'mousedown' && !draging) {
    draging = true
    CONF.x0 = x
    CONF.x1 = x
    CONF.y0 = y
    CONF.y1 = y
  }
  if ((event.type === 'mousemove') && draging) {
    CONF.x1 = x
    CONF.y1 = y
  }
  if (event.type === 'mouseup' && draging) {
    draging = false
    genPermalink()
  }
  return {x: x, y: y}
}


;['mousedown', 'mousemove', 'mouseup'].forEach(item => {
  selCanvas.addEventListener(item, (evt) => relMouseCoords(evt));
})


videoElement.addEventListener('resize', function(event) {
  selCanvas.width = videoElement.videoWidth;
  selCanvas.height = videoElement.videoHeight;
});

videoElement.addEventListener('play', () => {
  function step() {
    // selCtx.clearRect(0,0,selCanvas.width,selCanvas.height)
    selCtx.drawImage(videoElement, 0, 0, selCanvas.width, selCanvas.height)
    selCtx.fillStyle = '#ffffff77';
    selCtx.fillRect(CONF.x0, CONF.y0, CONF.x1-CONF.x0, CONF.y1-CONF.y0);
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step);
})









////////////////////////////////////////////
// otsu
////////////////////////////////////////////

var RED_INTENCITY_COEF = 0.2126;
var GREEN_INTENCITY_COEF = 0.7152;
var BLUE_INTENCITY_COEF = 0.0722;

function toGrayscale(context, w, h) {
    var imageData = context.getImageData(0, 0, w, h);
    var data = imageData.data;
    
    for(var i = 0; i < data.length; i += 4) {
        var brightness = RED_INTENCITY_COEF * data[i] + GREEN_INTENCITY_COEF * data[i + 1] + BLUE_INTENCITY_COEF * data[i + 2];
        // red
        data[i] = brightness;
        // green
        data[i + 1] = brightness;
        // blue
        data[i + 2] = brightness;
    }
    
    // overwrite original image
    context.putImageData(imageData, 0, 0);
};

function hist(context, w, h) {
    var imageData = context.getImageData(0, 0, w, h);
    var data = imageData.data;
    var brightness;
    var brightness256Val;
    var histArray = Array.apply(null, new Array(256)).map(Number.prototype.valueOf,0);
    
    for (var i = 0; i < data.length; i += 4) {
        brightness = RED_INTENCITY_COEF * data[i] + GREEN_INTENCITY_COEF * data[i + 1] + BLUE_INTENCITY_COEF * data[i + 2];
        brightness256Val = Math.floor(brightness);
        histArray[brightness256Val] += 1;
    }
    
    return histArray;
};

function otsu(histogram, total) {
    var sum = 0;
    for (var i = 1; i < 256; ++i)
        sum += i * histogram[i];
    var sumB = 0;
    var wB = 0;
    var wF = 0;
    var mB;
    var mF;
    var max = 0.0;
    var between = 0.0;
    var threshold1 = 0.0;
    var threshold2 = 0.0;
    for (var i = 0; i < 256; ++i) {
        wB += histogram[i];
        if (wB == 0)
            continue;
        wF = total - wB;
        if (wF == 0)
            break;
        sumB += i * histogram[i];
        mB = sumB / wB;
        mF = (sum - sumB) / wF;
        between = wB * wF * Math.pow(mB - mF, 2);
        if ( between >= max ) {
            threshold1 = i;
            if ( between > max ) {
                threshold2 = i;
            }
            max = between;            
        }
    }
    return ( threshold1 + threshold2 ) / 2.0;
};

function binarize(threshold, context, w, h) {
    var imageData = context.getImageData(0, 0, w, h);
    var data = imageData.data;
    var val;
    
    for(var i = 0; i < data.length; i += 4) {
        var brightness = RED_INTENCITY_COEF * data[i] + GREEN_INTENCITY_COEF * data[i + 1] + BLUE_INTENCITY_COEF * data[i + 2];
        if (document.getElementById('invert').checked) {
          val = ((brightness > threshold) ? 0 : 255);
        } else {
          val = ((brightness > threshold) ? 255 : 0);
        }
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
    }
    
    // overwrite original image
    context.putImageData(imageData, 0, 0);
}

const preprocess = function(ctx, canvas, img, roiNorm) {
  var w = img.width, h = img.height;
  toGrayscale(ctx, w, h);

  var gamma = parseFloat(document.getElementById('gamma').value)/10;
  var gammaCorrection = 1 / gamma;

  var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  function GetPixelColor(x, y) {   
      var index = parseInt(x + canvas.width * y) * 4;
      var rgb = {
          r : imageData.data[index + 0],
          g : imageData.data[index + 1],
          b : imageData.data[index + 2]
      };
      return rgb;
  }

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      var color = GetPixelColor(x, y)
      var newRed   = 255 * Math.pow((color.r / 255), gammaCorrection);
      var newGreen = 255 * Math.pow((color.g / 255), gammaCorrection);
      var newBlue  = 255 * Math.pow((color.b / 255), gammaCorrection);

      var color = {
        r: newRed,
        g: newGreen,
        b: newBlue
      }

      var index = parseInt(x + canvas.width * y) * 4;
      var data = imageData.data;
      
      data[index+0] = color.r;
      data[index+1] = color.g;
      data[index+2] = color.b;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  var histogram = hist(ctx, w, h);
  var threshold = otsu(histogram, w*h);
  binarize(threshold, ctx, w, h);
}
