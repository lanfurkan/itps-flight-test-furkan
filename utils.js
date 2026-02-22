/**
 * utils.js — PDF Design Tool shared utilities
 * Always reads fresh from File object — never reuses ArrayBuffer
 */
window.pdfUtils = (function(){
  function readFreshBuffer(file){
    return new Promise(function(resolve,reject){
      var r=new FileReader();
      r.onload=function(e){resolve(e.target.result);};
      r.onerror=function(){reject(new Error('Dosya okunamadı: '+file.name));};
      r.readAsArrayBuffer(file);
    });
  }

  async function renderPageToCanvas(file,pageNum,scale,canvas){
    var ab=await readFreshBuffer(file);
    var doc=await pdfjsLib.getDocument({data:new Uint8Array(ab)}).promise;
    var page=await doc.getPage(pageNum);
    var vp=page.getViewport({scale:scale});
    canvas.width=vp.width; canvas.height=vp.height;
    var ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport:vp}).promise;
    return {width:vp.width,height:vp.height,ptW:vp.width/scale,ptH:vp.height/scale};
  }

  async function loadPdfLib(file){
    var ab=await readFreshBuffer(file);
    return PDFLib.PDFDocument.load(ab,{ignoreEncryption:true});
  }

  function formatSize(bytes){
    if(bytes<1024) return bytes+' B';
    if(bytes<1048576) return (bytes/1024).toFixed(1)+' KB';
    return (bytes/1048576).toFixed(2)+' MB';
  }

  function setProgress(fill,text,pct,msg){
    fill.style.width=pct+'%'; text.textContent=msg;
  }

  function showResult(el,type,title,meta,actions){
    el.style.display='block';
    el.className='result-box result-'+type;
    var h='<div class="result-title">'+title+'</div><div class="result-meta">'+meta+'</div>';
    (actions||[]).forEach(function(a){
      h+='<a href="'+a.url+'" download="'+a.fn+'" class="btn btn-download" style="margin-top:10px;display:inline-flex">'+a.label+'</a> ';
    });
    el.innerHTML=h;
  }

  function setupDrop(dropEl,inputEl,ext,onFiles){
    dropEl.addEventListener('click',function(){inputEl.click();});
    dropEl.addEventListener('dragover',function(e){e.preventDefault();dropEl.classList.add('drag-over');});
    dropEl.addEventListener('dragleave',function(){dropEl.classList.remove('drag-over');});
    dropEl.addEventListener('drop',function(e){
      e.preventDefault();dropEl.classList.remove('drag-over');
      var files=Array.from(e.dataTransfer.files).filter(function(f){return f.name.toLowerCase().endsWith(ext);});
      if(files.length) onFiles(files);
    });
    inputEl.addEventListener('change',function(){
      var files=Array.from(inputEl.files).filter(function(f){return f.name.toLowerCase().endsWith(ext);});
      if(files.length) onFiles(files);
      inputEl.value='';
    });
  }

  return {readFreshBuffer,renderPageToCanvas,loadPdfLib,formatSize,setProgress,showResult,setupDrop};
})();
