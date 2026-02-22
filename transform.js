/**
 * transform.js
 * - Preview always shows rotated/cropped state (from result bytes)
 * - Rotate: reset to original, scope radio (all / selected only)
 * - Grid thumbs refresh after apply
 */
(function(){
  var dropZone=document.getElementById('tf-drop-zone');
  var fileInput=document.getElementById('tf-file-input');
  var workspace=document.getElementById('tf-workspace');
  var infoEl=document.getElementById('tf-info');
  var gridEl=document.getElementById('tf-grid');
  var selAllBtn=document.getElementById('tf-sel-all');
  var selNoneBtn=document.getElementById('tf-sel-none');
  var selBar=document.getElementById('tf-sel-bar');
  var selCountEl=document.getElementById('tf-sel-count');
  var prevBtn=document.getElementById('tf-prev-page');
  var nextBtn=document.getElementById('tf-next-page');
  var pageIndEl=document.getElementById('tf-page-ind');
  var previewCanvas=document.getElementById('tf-preview-canvas');

  // Rotate
  var rotApplyBtn=document.getElementById('rot-apply-btn');
  var rotResetBtn=document.getElementById('rot-reset-btn');
  var rotDlBtn=document.getElementById('rot-dl-btn');
  var rotResultEl=document.getElementById('rot-result');
  var rotProgressEl=document.getElementById('rot-progress');
  var rotFill=document.getElementById('rot-progress-fill');
  var rotText=document.getElementById('rot-progress-text');
  var rotBytes=null;
  var rotFilename='';

  // Crop
  var topIn=document.getElementById('tf-top'),bottomIn=document.getElementById('tf-bottom');
  var leftIn=document.getElementById('tf-left'),rightIn=document.getElementById('tf-right');
  var cropClearBtn=document.getElementById('crop-clear-btn');
  var cropApplyBtn=document.getElementById('crop-apply-btn');
  var cropDlBtn=document.getElementById('crop-dl-btn');
  var cropResultEl=document.getElementById('crop-result');
  var cropProgressEl=document.getElementById('crop-progress');
  var cropFill=document.getElementById('crop-progress-fill');
  var cropText=document.getElementById('crop-progress-text');
  var cropBytes=null;
  var cropFilename='';

  // Resize
  var resizePreset=document.getElementById('tf-preset');
  var customDims=document.getElementById('tf-custom-dims');
  var resizeApplyBtn=document.getElementById('resize-apply-btn');
  var resizeDlBtn=document.getElementById('resize-dl-btn');
  var resizeResultEl=document.getElementById('resize-result');
  var resizeProgressEl=document.getElementById('resize-progress');
  var resizeFill=document.getElementById('resize-progress-fill');
  var resizeText=document.getElementById('resize-progress-text');
  var resizeBytes=null;
  var resizeFilename='';

  var PAGE_SIZES={a4:{w:595.28,h:841.89},letter:{w:612,h:792},a3:{w:841.89,h:1190.55}};

  var currentFile=null;
  var totalPages=0;
  var previewPage=1;
  var selected=new Set();
  var chosenDeg=90;
  var baseSnap=null;
  var isDragging=false;
  var dragX0=0,dragY0=0;
  var cropRect=null;
  var previewW=0,previewH=0,pagePtW=0,pagePtH=0;

  // activeBytes: the bytes currently "in use" for preview (null = use original file)
  // per-page rotation state for reset
  var activePreviewBytes=null; // set after rotate apply, used by preview
  var originalFileBytes=null;  // cached on load for reset

  pdfUtils.setupDrop(dropZone,fileInput,'.pdf',function(f){loadFile(f[0]);});

  selAllBtn.addEventListener('click',function(){for(var i=1;i<=totalPages;i++)selected.add(i);syncCards();updateBar();});
  selNoneBtn.addEventListener('click',function(){selected.clear();syncCards();updateBar();});
  prevBtn.addEventListener('click',function(){if(previewPage>1){previewPage--;renderPreview();}});
  nextBtn.addEventListener('click',function(){if(previewPage<totalPages){previewPage++;renderPreview();}});

  document.querySelectorAll('.rot-deg-btn').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('.rot-deg-btn').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');chosenDeg=parseInt(b.dataset.deg,10);
    });
  });
  document.querySelector('.rot-deg-btn[data-deg="90"]').classList.add('active');

  resizePreset.addEventListener('change',function(){
    customDims.style.display=resizePreset.value==='custom'?'flex':'none';
  });

  [topIn,bottomIn,leftIn,rightIn].forEach(function(inp){
    inp.addEventListener('input',function(){syncRectFromInputs();redrawOverlay();});
  });

  cropClearBtn.addEventListener('click',function(){
    cropRect=null;topIn.value=0;bottomIn.value=0;leftIn.value=0;rightIn.value=0;
    if(baseSnap)previewCanvas.getContext('2d').putImageData(baseSnap,0,0);
  });

  // ---- canvas mouse coords (CSS scale-aware) ----
  function getCanvasCoords(e){
    var r=previewCanvas.getBoundingClientRect();
    var sx=previewCanvas.width/r.width;
    var sy=previewCanvas.height/r.height;
    var x=Math.max(0,Math.min(previewCanvas.width,(e.clientX-r.left)*sx));
    var y=Math.max(0,Math.min(previewCanvas.height,(e.clientY-r.top)*sy));
    return {x:x,y:y};
  }

  previewCanvas.style.cursor='crosshair';
  previewCanvas.addEventListener('mousedown',function(e){
    var c=getCanvasCoords(e);dragX0=c.x;dragY0=c.y;isDragging=true;cropRect=null;
  });
  previewCanvas.addEventListener('mousemove',function(e){
    if(!isDragging)return;
    var c=getCanvasCoords(e);
    cropRect={x:Math.min(dragX0,c.x),y:Math.min(dragY0,c.y),w:Math.abs(c.x-dragX0),h:Math.abs(c.y-dragY0)};
    redrawOverlay();
  });
  previewCanvas.addEventListener('mouseup',function(){
    if(!isDragging)return;isDragging=false;
    if(cropRect&&cropRect.w>5&&cropRect.h>5)syncInputsFromRect();
    else cropRect=null;
    redrawOverlay();
  });
  previewCanvas.addEventListener('mouseleave',function(){if(isDragging){isDragging=false;redrawOverlay();}});

  // ---- button wiring ----
  rotApplyBtn.addEventListener('click',applyRotate);

  rotResetBtn.addEventListener('click',async function(){
    if(!originalFileBytes)return;
    activePreviewBytes=null;
    rotBytes=null;rotDlBtn.disabled=true;
    rotResultEl.style.display='none';
    // Reset grid to original
    await refreshGridThumbsFromBytes(originalFileBytes, getAllPages());
    renderPreview();
  });

  rotDlBtn.addEventListener('click',function(){
    if(!rotBytes)return;
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rotBytes],{type:'application/pdf'}));
    a.download=rotFilename;a.click();
  });

  cropApplyBtn.addEventListener('click',applyCrop);
  cropDlBtn.addEventListener('click',function(){
    if(!cropBytes)return;
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([cropBytes],{type:'application/pdf'}));
    a.download=cropFilename;a.click();
  });

  resizeApplyBtn.addEventListener('click',applyResize);
  resizeDlBtn.addEventListener('click',function(){
    if(!resizeBytes)return;
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([resizeBytes],{type:'application/pdf'}));
    a.download=resizeFilename;a.click();
  });

  // ---------- LOAD ----------
  async function loadFile(file){
    currentFile=file;selected.clear();previewPage=1;
    rotBytes=null;cropBytes=null;resizeBytes=null;activePreviewBytes=null;
    rotDlBtn.disabled=true;cropDlBtn.disabled=true;resizeDlBtn.disabled=true;
    rotResultEl.style.display='none';cropResultEl.style.display='none';resizeResultEl.style.display='none';
    try{
      var ab=await pdfUtils.readFreshBuffer(file);
      originalFileBytes=new Uint8Array(ab);
      var doc=await PDFLib.PDFDocument.load(originalFileBytes,{ignoreEncryption:true});
      totalPages=doc.getPageCount();
      infoEl.textContent=file.name+' · '+totalPages+' pages';
      workspace.style.display='block';
      selBar.style.display='none';
      renderGrid();
      await renderPreview();
    }catch(e){alert('Could not load PDF: '+e.message);}
  }

  // ---------- GRID ----------
  function renderGrid(){
    gridEl.innerHTML='';
    for(var i=1;i<=totalPages;i++){
      (function(pn){
        var card=document.createElement('div');card.className='thumb-card';card.dataset.page=pn;
        var chk=document.createElement('div');chk.className='thumb-check';chk.textContent='✓';
        var cvs=document.createElement('canvas');cvs.style.cssText='width:100%;display:block;background:#fff';
        var lbl=document.createElement('div');lbl.className='thumb-label';lbl.textContent='Page '+pn;
        card.appendChild(chk);card.appendChild(cvs);card.appendChild(lbl);
        card.addEventListener('click',function(){
          previewPage=pn;renderPreview();
          if(selected.has(pn)){selected.delete(pn);card.classList.remove('selected');}
          else{selected.add(pn);card.classList.add('selected');}
          updateBar();
        });
        gridEl.appendChild(card);
        pdfUtils.renderPageToCanvas(currentFile,pn,0.38,cvs).catch(function(){});
      })(i);
    }
  }

  async function refreshGridThumbsFromBytes(bytes, pages){
    try{
      var pdfJsDoc=await pdfjsLib.getDocument({data:new Uint8Array(bytes)}).promise;
      for(var i=0;i<pages.length;i++){
        var pn=pages[i];
        var card=gridEl.querySelector('.thumb-card[data-page="'+pn+'"]');
        if(!card)continue;
        var cvs=card.querySelector('canvas');
        if(!cvs)continue;
        try{
          var pg=await pdfJsDoc.getPage(pn);
          var vp=pg.getViewport({scale:0.38});
          cvs.width=Math.round(vp.width);cvs.height=Math.round(vp.height);
          var ctx=cvs.getContext('2d');
          ctx.fillStyle='#fff';ctx.fillRect(0,0,cvs.width,cvs.height);
          await pg.render({canvasContext:ctx,viewport:vp}).promise;
        }catch(e){}
      }
    }catch(e){}
  }

  function syncCards(){
    gridEl.querySelectorAll('.thumb-card').forEach(function(c){
      c.classList.toggle('selected',selected.has(parseInt(c.dataset.page,10)));
    });
  }

  function updateBar(){
    if(selected.size===0){selBar.style.display='none';return;}
    selBar.style.display='flex';
    selCountEl.textContent=selected.size+' page'+(selected.size!==1?'s':'')+' selected';
  }

  function getAllPages(){
    var all=[];for(var i=1;i<=totalPages;i++)all.push(i);return all;
  }

  // ---------- PREVIEW ----------
  // Always renders from activePreviewBytes if set, else original file
  async function renderPreview(){
    pageIndEl.textContent=previewPage+' / '+totalPages;
    cropRect=null;topIn.value=0;bottomIn.value=0;leftIn.value=0;rightIn.value=0;
    try{
      var data;
      if(activePreviewBytes){
        data=activePreviewBytes;
      }else{
        var ab=await pdfUtils.readFreshBuffer(currentFile);
        data=new Uint8Array(ab);
      }
      var pdfJsDoc=await pdfjsLib.getDocument({data:new Uint8Array(data)}).promise;
      var page=await pdfJsDoc.getPage(previewPage);
      var vp=page.getViewport({scale:1.0});
      previewW=Math.round(vp.width);previewH=Math.round(vp.height);
      previewCanvas.width=previewW;previewCanvas.height=previewH;
      var ctx=previewCanvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,previewW,previewH);
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      var ov=page.getViewport({scale:1});pagePtW=ov.width;pagePtH=ov.height;
      baseSnap=ctx.getImageData(0,0,previewW,previewH);
    }catch(e){console.error(e);}
  }

  function syncRectFromInputs(){
    if(!pagePtW||!pagePtH)return;
    var t=parseFloat(topIn.value)||0,b=parseFloat(bottomIn.value)||0;
    var l=parseFloat(leftIn.value)||0,r=parseFloat(rightIn.value)||0;
    cropRect={x:l*previewW/pagePtW,y:t*previewH/pagePtH,w:previewW-(l+r)*previewW/pagePtW,h:previewH-(t+b)*previewH/pagePtH};
  }

  function syncInputsFromRect(){
    if(!pagePtW||!pagePtH||!cropRect)return;
    leftIn.value=Math.max(0,Math.round(cropRect.x*pagePtW/previewW));
    topIn.value=Math.max(0,Math.round(cropRect.y*pagePtH/previewH));
    rightIn.value=Math.max(0,Math.round((previewW-cropRect.x-cropRect.w)*pagePtW/previewW));
    bottomIn.value=Math.max(0,Math.round((previewH-cropRect.y-cropRect.h)*pagePtH/previewH));
  }

  function redrawOverlay(){
    var ctx=previewCanvas.getContext('2d');
    if(baseSnap)ctx.putImageData(baseSnap,0,0);
    if(!cropRect||cropRect.w<2||cropRect.h<2)return;
    ctx.fillStyle='rgba(0,0,0,0.46)';
    ctx.fillRect(0,0,previewW,cropRect.y);
    ctx.fillRect(0,cropRect.y+cropRect.h,previewW,previewH-cropRect.y-cropRect.h);
    ctx.fillRect(0,cropRect.y,cropRect.x,cropRect.h);
    ctx.fillRect(cropRect.x+cropRect.w,cropRect.y,previewW-cropRect.x-cropRect.w,cropRect.h);
    ctx.strokeStyle='#e8ff47';ctx.lineWidth=2;ctx.setLineDash([6,3]);
    ctx.strokeRect(cropRect.x,cropRect.y,cropRect.w,cropRect.h);
    ctx.setLineDash([]);
  }

  function getTargetPages(){
    // Check scope radio
    var scope=document.querySelector('input[name="rot-scope"]:checked');
    var useSelected=scope&&scope.value==='selected';
    if(useSelected&&selected.size>0)return Array.from(selected).sort(function(a,b){return a-b;});
    return getAllPages();
  }

  // ===== ROTATE =====
  async function applyRotate(){
    var pages=getTargetPages();
    rotProgressEl.style.display='block';rotResultEl.style.display='none';rotApplyBtn.disabled=true;rotDlBtn.disabled=true;
    try{
      pdfUtils.setProgress(rotFill,rotText,15,'Loading...');
      // Always rotate from original file to avoid cumulative rotations stacking
      var srcBytes=activePreviewBytes||originalFileBytes;
      var doc=await PDFLib.PDFDocument.load(srcBytes,{ignoreEncryption:true});
      pdfUtils.setProgress(rotFill,rotText,50,'Rotating...');
      pages.forEach(function(pn){
        var p=doc.getPage(pn-1);
        p.setRotation(PDFLib.degrees((p.getRotation().angle+chosenDeg)%360));
      });
      pdfUtils.setProgress(rotFill,rotText,85,'Saving...');
      rotBytes=await doc.save();
      pdfUtils.setProgress(rotFill,rotText,100,'Done!');
      rotFilename=currentFile.name.replace(/\.pdf$/i,'_rotated.pdf');
      // Update activePreviewBytes so clicking pages shows rotated state
      activePreviewBytes=rotBytes;
      rotResultEl.style.display='block';rotResultEl.className='result-box result-success';
      rotResultEl.innerHTML='<div class="result-title">✓ Rotation Applied</div>'+
        '<div class="result-meta">'+pages.length+' page'+(pages.length!==1?'s':'')+' rotated '+chosenDeg+'° · '+pdfUtils.formatSize(rotBytes.byteLength)+'</div>';
      rotDlBtn.disabled=false;
      // Refresh grid thumbnails + current preview
      await refreshGridThumbsFromBytes(rotBytes, pages);
      await renderPreview();
    }catch(e){pdfUtils.showResult(rotResultEl,'error','Error',e.message);}
    finally{rotProgressEl.style.display='none';rotApplyBtn.disabled=false;}
  }

  // ===== CROP =====
  async function applyCrop(){
    var pages=getTargetPages();
    var top=parseFloat(topIn.value)||0,bottom=parseFloat(bottomIn.value)||0;
    var left=parseFloat(leftIn.value)||0,right=parseFloat(rightIn.value)||0;
    if(!top&&!bottom&&!left&&!right){alert('Please enter crop values or drag a selection on the canvas.');return;}
    cropProgressEl.style.display='block';cropResultEl.style.display='none';cropApplyBtn.disabled=true;cropDlBtn.disabled=true;
    try{
      pdfUtils.setProgress(cropFill,cropText,10,'Loading...');
      var doc=await pdfUtils.loadPdfLib(currentFile);
      for(var k=0;k<pages.length;k++){
        pdfUtils.setProgress(cropFill,cropText,10+Math.round(k/pages.length*80),'Page '+(k+1)+'/'+pages.length);
        var page=doc.getPage(pages[k]-1);
        var sz=page.getSize();var pw=sz.width,ph=sz.height;
        var cx=left,cy=bottom,cw=Math.max(10,pw-left-right),ch=Math.max(10,ph-top-bottom);
        page.setMediaBox(cx,cy,cw,ch);page.setCropBox(cx,cy,cw,ch);
      }
      pdfUtils.setProgress(cropFill,cropText,95,'Saving...');
      cropBytes=await doc.save();
      pdfUtils.setProgress(cropFill,cropText,100,'Done!');
      cropFilename=currentFile.name.replace(/\.pdf$/i,'_cropped.pdf');
      cropResultEl.style.display='block';cropResultEl.className='result-box result-success';
      cropResultEl.innerHTML='<div class="result-title">✓ Crop Applied</div>'+
        '<div class="result-meta">'+pages.length+' page'+(pages.length!==1?'s':'')+' · '+pdfUtils.formatSize(cropBytes.byteLength)+'</div>';
      cropDlBtn.disabled=false;
      await refreshGridThumbsFromBytes(cropBytes, pages);
    }catch(e){pdfUtils.showResult(cropResultEl,'error','Error',e.message);}
    finally{cropProgressEl.style.display='none';cropApplyBtn.disabled=false;}
  }

  // ===== RESIZE =====
  async function applyResize(){
    var preset=resizePreset.value;
    if(preset==='none'){alert('Please select a size.');return;}
    var pages=getTargetPages();
    resizeProgressEl.style.display='block';resizeResultEl.style.display='none';resizeApplyBtn.disabled=true;resizeDlBtn.disabled=true;
    try{
      pdfUtils.setProgress(resizeFill,resizeText,10,'Loading...');
      var doc=await pdfUtils.loadPdfLib(currentFile);
      for(var k=0;k<pages.length;k++){
        pdfUtils.setProgress(resizeFill,resizeText,10+Math.round(k/pages.length*80),'Page '+(k+1)+'/'+pages.length);
        var page=doc.getPage(pages[k]-1);
        var sz=page.getSize();var pw=sz.width,ph=sz.height;
        var nw,nh;
        if(preset==='custom'){
          nw=parseFloat(document.getElementById('tf-cw').value)||595;
          nh=parseFloat(document.getElementById('tf-ch').value)||842;
        }else{nw=PAGE_SIZES[preset].w;nh=PAGE_SIZES[preset].h;}
        page.setSize(nw,nh);
        try{page.scaleContent(nw/pw,nh/ph);}catch(e){}
      }
      pdfUtils.setProgress(resizeFill,resizeText,95,'Saving...');
      resizeBytes=await doc.save();
      pdfUtils.setProgress(resizeFill,resizeText,100,'Done!');
      resizeFilename=currentFile.name.replace(/\.pdf$/i,'_resized.pdf');
      resizeResultEl.style.display='block';resizeResultEl.className='result-box result-success';
      resizeResultEl.innerHTML='<div class="result-title">✓ Resize Applied</div>'+
        '<div class="result-meta">'+pages.length+' page'+(pages.length!==1?'s':'')+' · '+pdfUtils.formatSize(resizeBytes.byteLength)+'</div>';
      resizeDlBtn.disabled=false;
      await refreshGridThumbsFromBytes(resizeBytes, pages);
    }catch(e){pdfUtils.showResult(resizeResultEl,'error','Error',e.message);}
    finally{resizeProgressEl.style.display='none';resizeApplyBtn.disabled=false;}
  }
})();
