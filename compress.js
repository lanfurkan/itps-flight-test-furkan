/**
 * compress.js
 */
(function(){
  var dropZone=document.getElementById('compress-drop-zone');
  var fileInput=document.getElementById('compress-file-input');
  var optionsEl=document.getElementById('compress-options');
  var filenameEl=document.getElementById('compress-filename');
  var origSizeEl=document.getElementById('compress-original-size');
  var compressBtn=document.getElementById('compress-btn');
  var progressEl=document.getElementById('compress-progress');
  var progressFill=document.getElementById('compress-progress-fill');
  var progressText=document.getElementById('compress-progress-text');
  var resultEl=document.getElementById('compress-result');
  var currentFile=null;
  var SETTINGS={low:{scale:1.5,quality:0.88},medium:{scale:1.2,quality:0.72},high:{scale:0.9,quality:0.55}};

  document.querySelectorAll('.level-card').forEach(function(c){
    c.addEventListener('click',function(){document.querySelectorAll('.level-card').forEach(function(x){x.classList.remove('selected');});c.classList.add('selected');});
  });

  pdfUtils.setupDrop(dropZone,fileInput,'.pdf',function(f){loadFile(f[0]);});
  compressBtn.addEventListener('click',performCompress);

  function loadFile(file){
    currentFile=file;filenameEl.textContent=file.name;
    origSizeEl.textContent=pdfUtils.formatSize(file.size);
    optionsEl.style.display='block';resultEl.style.display='none';
  }

  async function performCompress(){
    var level=document.querySelector('input[name="compress-level"]:checked').value;
    var removeMeta=document.getElementById('compress-metadata').checked;
    var s=SETTINGS[level];
    progressEl.style.display='block';resultEl.style.display='none';compressBtn.disabled=true;
    try{
      pdfUtils.setProgress(progressFill,progressText,5,'Yükleniyor...');
      var ab=await pdfUtils.readFreshBuffer(currentFile);
      var pdfJsDoc=await pdfjsLib.getDocument({data:new Uint8Array(ab)}).promise;
      var total=pdfJsDoc.numPages;
      var nd=await PDFLib.PDFDocument.create();
      for(var i=1;i<=total;i++){
        pdfUtils.setProgress(progressFill,progressText,5+Math.round((i-1)/total*85),'Sayfa '+i+'/'+total);
        var page=await pdfJsDoc.getPage(i);
        var vp=page.getViewport({scale:s.scale});
        var cvs=document.createElement('canvas');
        cvs.width=Math.round(vp.width);cvs.height=Math.round(vp.height);
        var ctx=cvs.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,cvs.width,cvs.height);
        await page.render({canvasContext:ctx,viewport:vp}).promise;
        var d=cvs.toDataURL('image/jpeg',s.quality);
        var bin=atob(d.split(',')[1]);var bytes=new Uint8Array(bin.length);
        for(var k=0;k<bin.length;k++)bytes[k]=bin.charCodeAt(k);
        var img=await nd.embedJpg(bytes);
        nd.addPage([vp.width,vp.height]).drawImage(img,{x:0,y:0,width:vp.width,height:vp.height});
        cvs.width=0;cvs.height=0;
      }
      if(removeMeta){nd.setTitle('');nd.setAuthor('');nd.setSubject('');nd.setKeywords([]);nd.setProducer('');nd.setCreator('');}
      pdfUtils.setProgress(progressFill,progressText,95,'Kaydediliyor...');
      var out=await nd.save({useObjectStreams:true});
      pdfUtils.setProgress(progressFill,progressText,100,'Hazır!');
      var orig=currentFile.size,nw=out.byteLength,sav=Math.max(0,Math.round((1-nw/orig)*100));
      var url=URL.createObjectURL(new Blob([out],{type:'application/pdf'}));
      resultEl.style.display='block';resultEl.className='result-box result-success';
      resultEl.innerHTML='<div class="result-title">✓ Sıkıştırma Tamamlandı</div>'+
        '<div class="size-compare"><span class="size-original">'+pdfUtils.formatSize(orig)+'</span>'+
        ' <span class="size-arrow">→</span> <span class="size-new">'+pdfUtils.formatSize(nw)+'</span>'+
        ' <span class="size-savings">-%'+sav+' tasarruf</span></div>'+
        '<a href="'+url+'" download="'+currentFile.name.replace(/\.pdf$/i,'_compressed.pdf')+'" class="btn btn-download" style="margin-top:10px;display:inline-flex">⬇ PDF İndir</a>';
    }catch(e){pdfUtils.showResult(resultEl,'error','Hata',e.message);}
    finally{progressEl.style.display='none';compressBtn.disabled=false;}
  }
})();
