var hls;
var debug;
var recoverDecodingErrorDate,recoverSwapAudioCodecDate;
var pendingTimedMetadata = [];
let lastInterval=null;
let lastId3Tag=null;

class Graph {
  
  constructor(id) {
    this.myCanvas = document.getElementById(id);
    this.context = this.myCanvas.getContext('2d');

    this.data = []
  }

  drawLine(sourceX,sourceY,destnationX,destnationY){
    this.context.beginPath();
    this.context.moveTo(sourceX, sourceY);
    this.context.lineTo(destnationX, destnationY);
    this.context.stroke();
  }

  calcScale(data,height){


    let min = 0, max = 0;
    if (data.length>0)
      max=data.reduce( (max,current)=>Math.max(max,current),data[0])

    var delta = max - min;

    return {
      min: min,
      max: max,
      offsetY: min,
      multiplicatorY: ((height / delta) / 100) *90
    }
  }

  drawGraphAxis(min,max,boxSize){

    const labelCount = 10;
    const stepSize = boxSize / labelCount;
    const delta = max - min;
  
  
    this.context.fillStyle = '#000';
    this.context.strokeStyle  = '#000';
    this.context.lineWidth = 1;

    const fixed  =  (delta<7) ? 1 : 0
    for(let i = 0; i <= labelCount;i++){ 
      
      
      let currentScale = (1 / labelCount) * i; 
      
      let label =(min + (delta*currentScale)).toFixed(fixed)
      let y= ((stepSize * i) * -1 ) + boxSize 
      this.context.fillText( label, 1, y-3 ) ; 
      this.drawLine(1,y,1000,y)
    }  
  }
  
  drawGraph(data,window){

    let rightMargin=20

    this.context.clearRect(0, 0, this.myCanvas.width, this.myCanvas.height);  
    this.context.fillStyle = '#aaa';
    this.context.fillRect(0, 0, this.myCanvas.width, this.myCanvas.height);
 
    this.context.strokeStyle  = '#000';
    this.drawLine(rightMargin,0,rightMargin,this.myCanvas.height)

    let scale = this.calcScale(data,this.myCanvas.height);

    let stepInPixel = (this.myCanvas.width-rightMargin)/window;
    let multiplicatorY = scale.multiplicatorY;
    let offsetY = scale.offsetY;

    let offset = rightMargin;
    let lastY = 0;
    this.context.strokeStyle  = '#111';
    this.context.lineWidth = 3;

    for(let i = Math.max(0,data.length-window); i < data.length;i++){
      let currentY =  ((data[i] * multiplicatorY) * -1) + (offsetY* multiplicatorY)   + this.myCanvas.height ;
      if(i == 0){
        lastY = currentY;
      }
    
      
      this.drawLine(offset,lastY,offset+stepInPixel,currentY)
      offset += stepInPixel;
      lastY = currentY;

    } 
    this.drawGraphAxis(scale.min,scale.max,this.myCanvas.height);
  }

}
class Stats {
  constructor() {
    this.maxSize=1000
    this.clear()
  }

  clear() {
    this.values=[]
    this.total = 0
    this.avg = 0
    this.median = 0
    this.min = 0
    this.max = 0
    this.top90 = 0
  }

  addValue(value) {
    if (!value || Number.isNaN(value)) {
      return
    }
    this.total +=value
    this.values.push(value);
    if (this.values.length>this.maxSize) {
      let first=this.values.shift();
      this.total += first
    }
    this.avg = this.total / this.values.length;
    this.max = this.values.reduce( (max,current)=> Math.max(max,current),this.values[0])
    this.min = this.values.reduce( (min,current)=> Math.min(min,current),this.values[0])

    //don't care about performance...
    const nums = [...this.values].sort((a, b) => a - b);
    const top90 = Math.floor(nums.length *0.9), mid = Math.floor(nums.length / 2);
    this.median =  nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    this.top90 =  nums[top90];
  }
}

let bufferStats=new Stats();
let bufferGraph=null;

function getFileNameFromUrl(url) {
  let queryIndex=url.indexOf('?')
  let postfix="";
  let prefix="";
  if (queryIndex>0) {
    url=url.substring(0,queryIndex);
    postfix="?...";
  }
  if (url.indexOf("http")==0) {
    prefix=".../"
  }
  return prefix+url.substring(url.lastIndexOf('/')+1)+postfix;
}

const seqRegex = /index-(s\d+)\.m3u8/i;

function getSequenceFromUrl(url) {
  let fileName=getFileNameFromUrl(url)
  let m=fileName.match(seqRegex)
    if (m) {
      console.warn(m)
    return m[1]
  } else {
  }
  return fileName;
}

function updateOverlay(id,content)  {
  try {
    document.getElementById(id).innerHTML=content;
  } 
  catch(e) {
    alert(e);
  }
}

function handleMediaError(hls) {
  var now = performance.now();
  if(!recoverDecodingErrorDate || (now - recoverDecodingErrorDate) > 3000) {
    recoverDecodingErrorDate = performance.now();
    var msg = "trying to recover from media Error ..."
    console.warn(msg);
    hls.recoverMediaError();
  } else {
    if(!recoverSwapAudioCodecDate || (now - recoverSwapAudioCodecDate) > 3000) {
      recoverSwapAudioCodecDate = performance.now();
      var msg = "trying to swap Audio Codec and recover from media Error ..."
      console.warn(msg);
      hls.swapAudioCodec();
      hls.recoverMediaError();
    } else {
      var msg = "cannot recover, last media error recovery failed ..."
      console.error(msg);
    }
  }
}

function handleTimedMetadata(event, data) {
  for (var i = 0; i < data.samples.length; i++) {
    var pts = data.samples[i].pts;
    var str =  new TextDecoder('utf-8').decode(data.samples[i].data.subarray(22));
    pendingTimedMetadata.push({pts: pts, value: str});
  }
}


function timeUpdateCallback() {
  if (pendingTimedMetadata.length == 0 || pendingTimedMetadata[0].pts > video.currentTime) {
    return;
  }
  var e = pendingTimedMetadata[0];
  pendingTimedMetadata = pendingTimedMetadata.slice(1);
  console.log('Metadata ' + e.value + " at " + e.pts + "s");
  lastId3Tag=JSON.parse("{"+e.value.substring(0,e.value.indexOf("}")+1))
  lastId3Tag.pts=e.pts;
  updateOverlay('id3',`id3: <span>timstamp: ${new Date(lastId3Tag.timestamp).toISOString()} sequenceId:${lastId3Tag.sequenceId} pts: ${e.pts.toFixed(2)}</span>`)
}


function playM3u8(url){
  var video = document.getElementById('video');
  if(native){
    video.classList.add("native_mode");
    video.classList.remove("zoomed_mode");
  } else {
    video.classList.remove("native_mode");
    video.classList.add("zoomed_mode");
  }
  if(hls){ hls.destroy(); }
  hls = new Hls({debug:debug});

  console.warn("Hls version: ",Hls.version  )
  hls.on(Hls.Events.ERROR, function(event,data) {
    var  msg = "Player error: " + data.type + " - " + data.details;
    console.error(msg);
    
    document.getElementById('last_error').innerHTML+= msg+"<br/>"

    if(data.fatal) {
      switch(data.type) {
        case Hls.ErrorTypes.MEDIA_ERROR:
          handleMediaError(hls);
          break;
        case Hls.ErrorTypes.NETWORK_ERROR:
           console.error("network error ...");
          break;
        default:
          console.error("unrecoverable error");
          hls.destroy();
          break;
      }
    }
   });
  var m3u8Url = decodeURIComponent(url)
  hls.loadSource(m3u8Url);
  hls.attachMedia(video);
  video.ontimeupdate = timeUpdateCallback;


  hls.on(Hls.Events.MANIFEST_PARSED,function() {
    try {

      updateOverlay('levels',hls.levels.map( (level,index)=> {
        if (level.attrs){
          let sequence= getSequenceFromUrl(level.url[0])
          return `<button id="level_button_${index}"  type="button">${sequence} (${level.attrs.RESOLUTION}) (${(level.attrs.BANDWIDTH/1024).toFixed(0)}Kb)</button></br>`;
        }
      }).join(""));

      hls.levels.forEach( (level,idx)=>  {
        let elm=document.getElementById(`level_button_${idx}`);
        if (elm) {
          elm.onclick =  ()=> {
            hls.loadLevel=idx
          };
        }
      });  
    }catch(e) {
      console.warn(e);
    }
    
    video.play();
  });

  hls.on(Hls.Events.LEVEL_SWITCHING,(id,args)=> {
    try {
      hls.levels.forEach( (level,idx)=>  {
        let elm=document.getElementById(`level_button_${idx}`);
        if (elm) {
          if (idx==args.level && idx!=hls.currentLevel ) 
            elm.style.color="orange";
          else {
            elm.style.color=(idx==hls.currentLevel) ? "blue" : "black";
          }
        }
      });    
    }catch(e) {
      console.warn(e);
    }
  });

  hls.on(Hls.Events.LEVEL_SWITCHED,(id,args)=> {
    hls.levels.forEach( (level,idx)=>  {
      let elm=document.getElementById(`level_button_${idx}`);
      if (elm) {
        elm.style.color=(idx==args.level) ? "blue" : "black";
      }
    });    
  });

  const getFileNameFromArgs=(args)=> {
    return getFileNameFromUrl(args.part ? args.part.url : args.frag.url)
  }

  hls.on(Hls.Events.FRAG_LOADING,(id,args)=> {
    updateOverlay('loading_ts',`Loading: ${getFileNameFromArgs(args)}`)
  });
  const map=new Map()
  hls.on(Hls.Events.FRAG_LOADED,(id,args)=> {
    //console.warn("frag changed",args.frag.sn);
    updateOverlay('loading_ts',`Loading: Idle`)
    updateOverlay('lastloaded_ts',`Loaded: ${getFileNameFromArgs(args)}`)// ${JSON.stringify(args.stats)}`)
    map.set(args.frag.sn,args.frag.url)
    
  });
  hls.on(Hls.Events.FRAG_CHANGED,(id,args)=> {
    //console.warn("frag changed",args.frag.sn);
    const url = map.get(args.frag.sn)
    updateOverlay('current_ts',`Current: ${getFileNameFromUrl(url)}`)
    if (map.size>1000) {
      map.clear()
    }
  });
  hls.on(Hls.Events.LEVEL_LOADING,(id,args)=> {
    document.getElementById("index").style.color = "blue"
    //updateOverlay('index',`${args.networkDetails.responseText}`)

  });
  hls.on(Hls.Events.LEVEL_LOADED,(id,args)=> {
    //console.warn(args);
    document.getElementById("index").style.color = "white"
    const lines  = args.networkDetails.responseText.split("\n");

    let linesFromTop=-1

    let modified = lines.map( (line,index)=> {
      if (line[0]!=="#") {
        if (linesFromTop===-1) {
          linesFromTop=(index-1)+4*2 //4 segments from top;
        }
        return getFileNameFromUrl(line)
      }

      return line;
    })

    const linesFromBottom=4*2 //4 segments 

    if (modified.length>linesFromBottom+linesFromTop) {
      let shorter = modified.slice(0,linesFromTop);
      let segmentsCut =  Math.max(0,(lines.length-linesFromBottom-linesFromTop-1)/2)
      shorter=shorter.concat([`.... (${segmentsCut} segments) .....`]).concat(modified.slice(Math.max(linesFromTop,modified.length-linesFromBottom-1)))
      updateOverlay('index',shorter.join("\n"))
    } else {
      updateOverlay('index',modified.join("\n"))
    }

  });
  hls.on(Hls.Events.FRAG_PARSING_METADATA, handleTimedMetadata);

  
  document.title = url

  if (lastInterval){
    clearInterval(lastInterval)
  }
  lastInterval = setInterval( ()=> {
    if (video && video.currentTime>0) {
      let buffer = video.duration-video.currentTime
      bufferStats.addValue(buffer)
      updateOverlay('buffer',`buffer: ${buffer.toFixed(2)}`)
      bufferGraph.drawGraph(bufferStats.values,bufferStats.maxSize)
      if (lastId3Tag) {
        let absoluteTime = new Date((video.currentTime-lastId3Tag.pts)*1000 + lastId3Tag.timestamp);
        let currentTime=new Date();
        updateOverlay('absolute',`current frame: ${absoluteTime.toISOString()} latency: ${(currentTime-absoluteTime)/1000.0.toFixed(1)}sec`);
      }
    }
  },100);

}

chrome.storage.local.get({
  hlsjs: currentVersion,
  debug: false,
  native: false
}, function(settings) {
  debug = settings.debug;
  native = settings.native;
  var s = document.createElement('script');
  var version = currentVersion
  if (supportedVersions.includes(settings.hlsjs)) {
    version = settings.hlsjs
  }
  s.src = chrome.runtime.getURL('hlsjs/hls.'+version+'.min.js');
  s.onload = function() { 
    
    bufferGraph = new Graph("bufferCanvas")
    playM3u8(window.location.href.split("#")[1]); 
  };
  (document.head || document.documentElement).appendChild(s);
});

$(window).bind('hashchange', function() {
  playM3u8(window.location.href.split("#")[1]);
});