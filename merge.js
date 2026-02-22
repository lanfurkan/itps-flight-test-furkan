/**
 * merge.js — pageOrder built once, preserved across view switches
 */
(function(){
  var dropZone=document.getElementById('merge-drop-zone');
  var fileInput=document.getElementById('merge-file-input');
  var workspace=document.getElementById('merge-workspace');
  var fileCountEl=document.getElementById('merge-file-count');
  var viewToggle=document.getElementById('merge-view-toggle');
  var clearBtn=document.getElementById('merge-clear-btn');
  var mergeBtn=document.getElementById('merge-btn');
  var fileListEl=document.getElementById('merge-file-list');
  var fileViewEl=document.getElementById('merge-file-view');
  var pageViewEl=document.getElementById('merge-page-view');
  var pageGridEl=document.getElementById('merge-page-grid');
  var progressEl=document.getElementById('merge-progress');
  var progressFill=document.getElementById('merge-progress-fill');
  var progressText=document.getElementById('merge-progress-text');
  var resultEl=document.getElementById('merge-result');

  var files=[];      // [{file, pageCount, name, docBytes}]
  var pageOrder=[];  // [{fileIdx, pageNum, label}] — deleted pages removed immediately
  var pageOrderBuilt=false;  // true once page view has been opened
  var pageViewActive=false;
  var dragSrcIdx=null;
  var dragSrcFile=null;
  var thumbCache={};

  pdfUtils.setupDrop(dropZone,fileInput,'.pdf',handleFiles);
  clearBtn.addEventListener('click',reset);
  mergeBtn.addEventListener('click',performMerge);
  viewToggle.addEventListener('click',toggleView);

  async function handleFiles(newFiles){
    for(var i=0;i<newFiles.length;i++){
      var f=newFiles[i];
      try{
        var ab=await pdfUtils.readFreshBuffer(f);
        var docBytes=new Uint8Array(ab);
        var doc=await PDFLib.PDFDocument.load(docBytes,{ignoreEncryption:true});
        var fi=files.length;
        files.push({file:f,pageCount:doc.getPageCount(),name:f.name,docBytes:docBytes});
        // Append new file's pages to pageOrder if already built
        if(pageOrderBuilt){
          for(var p=1;p<=doc.getPageCount();p++){
            pageOrder.push({fileIdx:fi,pageNum:p,label:f.name.replace(/\.pdf$/i,'')+'  p.'+p});
          }
        }
      }catch(e){alert('Could not load: '+f.name+'\n'+e.message);}
    }
    workspace.style.display='block';
    renderFileView();
    updateCount();
    // If page view is active, re-render grid with current pageOrder
    if(pageViewActive) renderPageGrid();
  }

  function reset(){
    files=[];pageOrder=[];pageOrderBuilt=false;thumbCache={};pageViewActive=false;
    workspace.style.display='none';
    fileViewEl.style.display='block';pageViewEl.style.display='none';
    viewToggle.textContent='🔲 Page View';
    resultEl.style.display='none';
  }

  function updateCount(){
    var total=files.reduce(function(s,f){return s+f.pageCount;},0);
    fileCountEl.textContent=files.length+' file'+(files.length!==1?'s':'')+' · '+total+' page'+(total!==1?'s':'');
  }

  function toggleView(){
    pageViewActive=!pageViewActive;
    if(pageViewActive){
      fileViewEl.style.display='none';
      pageViewEl.style.display='block';
      viewToggle.textContent='📄 File View';
      // Build pageOrder only on FIRST open; after that preserve it
      if(!pageOrderBuilt){
        buildPageOrderFromFiles();
        pageOrderBuilt=true;
      } else {
        renderPageGrid(); // just re-render, don't rebuild
      }
    }else{
      fileViewEl.style.display='block';
      pageViewEl.style.display='none';
      viewToggle.textContent='🔲 Page View';
    }
  }

  function buildPageOrderFromFiles(){
    pageOrder=[];
    files.forEach(function(f,fi){
      for(var p=1;p<=f.pageCount;p++){
        pageOrder.push({fileIdx:fi,pageNum:p,label:f.name.replace(/\.pdf$/i,'')+'  p.'+p});
      }
    });
    preloadThumbs();
    renderPageGrid();
  }

  // ---------- FILE VIEW ----------
  function renderFileView(){
    fileListEl.innerHTML='';
    files.forEach(function(item,idx){
      var el=document.createElement('div');
      el.className='file-item';el.dataset.idx=idx;
      el.innerHTML=
        '<span class="file-drag-handle">⠿</span>'+
        '<div class="file-thumb"><canvas></canvas></div>'+
        '<div class="file-info">'+
          '<div class="file-item-name">'+item.name+'</div>'+
          '<div class="file-item-meta">'+item.pageCount+' page'+(item.pageCount!==1?'s':'')+' · '+pdfUtils.formatSize(item.file.size)+'</div>'+
        '</div>'+
        '<button class="file-remove-btn" title="Remove">✕</button>';

      el.querySelector('.file-remove-btn').addEventListener('click',function(e){
        e.stopPropagation();
        var removedFi=idx;
        // Remove pages of this file from pageOrder too
        pageOrder=pageOrder.filter(function(p){return p.fileIdx!==removedFi;});
        // Remap fileIdx values that are > removedFi
        pageOrder.forEach(function(p){if(p.fileIdx>removedFi)p.fileIdx--;});
        files.splice(removedFi,1);
        renderFileView();updateCount();
        if(files.length===0){workspace.style.display='none';pageOrderBuilt=false;}
      });
      pdfUtils.renderPageToCanvas(item.file,1,0.28,el.querySelector('canvas')).catch(function(){});

      el.setAttribute('draggable','true');
      el.addEventListener('dragstart',function(e){
        dragSrcFile=idx;e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',String(idx));
        setTimeout(function(){el.classList.add('dragging');},0);
      });
      el.addEventListener('dragend',function(){
        el.classList.remove('dragging');
        fileListEl.querySelectorAll('.file-item').forEach(function(x){x.classList.remove('drag-target');});
        dragSrcFile=null;
      });
      el.addEventListener('dragover',function(e){
        e.preventDefault();e.dataTransfer.dropEffect='move';
        fileListEl.querySelectorAll('.file-item').forEach(function(x){x.classList.remove('drag-target');});
        el.classList.add('drag-target');
      });
      el.addEventListener('dragleave',function(){el.classList.remove('drag-target');});
      el.addEventListener('drop',function(e){
        e.preventDefault();e.stopPropagation();
        el.classList.remove('drag-target');
        if(dragSrcFile===null||dragSrcFile===idx)return;
        var moved=files.splice(dragSrcFile,1)[0];
        files.splice(idx,0,moved);
        // Remap pageOrder fileIdx values to match new files order
        var oldIdx=dragSrcFile,newIdx=idx;
        pageOrder.forEach(function(p){
          if(p.fileIdx===oldIdx){p.fileIdx=newIdx;}
          else if(oldIdx<newIdx&&p.fileIdx>oldIdx&&p.fileIdx<=newIdx){p.fileIdx--;}
          else if(oldIdx>newIdx&&p.fileIdx>=newIdx&&p.fileIdx<oldIdx){p.fileIdx++;}
        });
        dragSrcFile=null;
        renderFileView();updateCount();
      });
      fileListEl.appendChild(el);
    });
  }

  // ---------- PAGE VIEW ----------
  async function preloadThumbs(){
    for(var i=0;i<pageOrder.length;i++){
      var item=pageOrder[i];
      var key=item.fileIdx+'-'+item.pageNum;
      if(thumbCache[key])continue;
      var fileObj=files[item.fileIdx];
      if(!fileObj)continue;
      try{
        var tmpCvs=document.createElement('canvas');
        await pdfUtils.renderPageToCanvas(fileObj.file,item.pageNum,0.35,tmpCvs);
        thumbCache[key]=tmpCvs.toDataURL();
      }catch(e){}
    }
  }

  function renderPageGrid(){
    pageGridEl.innerHTML='';
    pageOrder.forEach(function(item,visIdx){
      var key=item.fileIdx+'-'+item.pageNum;
      var card=document.createElement('div');
      card.className='thumb-card draggable-card';
      card.dataset.vis=visIdx;

      var img=document.createElement('img');
      img.style.cssText='width:100%;display:block;background:#fff;min-height:60px';
      if(thumbCache[key]){
        img.src=thumbCache[key];
      }else{
        var fileObj=files[item.fileIdx];
        if(fileObj){
          var tmpCvs=document.createElement('canvas');
          pdfUtils.renderPageToCanvas(fileObj.file,item.pageNum,0.35,tmpCvs).then(function(k,im){
            return function(){thumbCache[k]=tmpCvs.toDataURL();im.src=thumbCache[k];};
          }(key,img)).catch(function(){});
        }
      }

      var lbl=document.createElement('div');lbl.className='thumb-label';lbl.textContent=item.label;
      var del=document.createElement('button');del.className='page-del-btn';del.textContent='✕';del.title='Delete page';
      del.addEventListener('click',function(e){
        e.stopPropagation();
        var vi=parseInt(card.dataset.vis,10);
        pageOrder.splice(vi,1);
        renderPageGrid();
      });

      card.appendChild(del);card.appendChild(img);card.appendChild(lbl);

      card.setAttribute('draggable','true');
      card.addEventListener('dragstart',function(e){
        dragSrcIdx=parseInt(card.dataset.vis,10);
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',String(dragSrcIdx));
        setTimeout(function(){card.classList.add('dragging');},0);
      });
      card.addEventListener('dragend',function(){
        card.classList.remove('dragging');
        pageGridEl.querySelectorAll('.drag-target').forEach(function(x){x.classList.remove('drag-target');});
        dragSrcIdx=null;
      });
      card.addEventListener('dragover',function(e){
        e.preventDefault();
        pageGridEl.querySelectorAll('.drag-target').forEach(function(x){x.classList.remove('drag-target');});
        card.classList.add('drag-target');
      });
      card.addEventListener('dragleave',function(){card.classList.remove('drag-target');});
      card.addEventListener('drop',function(e){
        e.preventDefault();e.stopPropagation();
        card.classList.remove('drag-target');
        var targetIdx=parseInt(card.dataset.vis,10);
        if(dragSrcIdx===null||dragSrcIdx===targetIdx)return;
        var moved=pageOrder.splice(dragSrcIdx,1)[0];
        pageOrder.splice(targetIdx,0,moved);
        dragSrcIdx=null;
        renderPageGrid();
      });

      pageGridEl.appendChild(card);
    });
  }

  // ---------- MERGE ----------
  async function performMerge(){
    if(files.length<2){pdfUtils.showResult(resultEl,'error','Not enough files','Please add at least 2 PDFs.');return;}
    progressEl.style.display='block';resultEl.style.display='none';mergeBtn.disabled=true;
    try{
      var merged=await PDFLib.PDFDocument.create();

      if(pageViewActive&&pageOrderBuilt&&pageOrder.length>0){
        pdfUtils.setProgress(progressFill,progressText,5,'Preparing...');
        var docCache={};
        var uniqueIdxs=[...new Set(pageOrder.map(function(p){return p.fileIdx;}))];
        for(var u=0;u<uniqueIdxs.length;u++){
          var fi=uniqueIdxs[u];
          docCache[fi]=await PDFLib.PDFDocument.load(files[fi].docBytes,{ignoreEncryption:true});
          pdfUtils.setProgress(progressFill,progressText,5+Math.round((u+1)/uniqueIdxs.length*25),'Loading file '+(u+1)+'/'+uniqueIdxs.length+'...');
        }
        for(var i=0;i<pageOrder.length;i++){
          pdfUtils.setProgress(progressFill,progressText,30+Math.round(i/pageOrder.length*60),(i+1)+'/'+pageOrder.length+' pages...');
          var cp=await merged.copyPages(docCache[pageOrder[i].fileIdx],[pageOrder[i].pageNum-1]);
          merged.addPage(cp[0]);
        }
      }else{
        for(var j=0;j<files.length;j++){
          pdfUtils.setProgress(progressFill,progressText,10+Math.round(j/files.length*80),'"'+files[j].name+'"...');
          var src=await PDFLib.PDFDocument.load(files[j].docBytes,{ignoreEncryption:true});
          var cp2=await merged.copyPages(src,src.getPageIndices());
          cp2.forEach(function(p){merged.addPage(p);});
        }
      }

      pdfUtils.setProgress(progressFill,progressText,97,'Saving...');
      var bytes=await merged.save();
      pdfUtils.setProgress(progressFill,progressText,100,'Done!');
      var url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      pdfUtils.showResult(resultEl,'success','✓ Merge Complete',
        merged.getPageCount()+' pages · '+pdfUtils.formatSize(bytes.byteLength),
        [{label:'⬇ Download PDF',url:url,fn:'merged.pdf'}]);
    }catch(e){pdfUtils.showResult(resultEl,'error','Error',e.message);}
    finally{progressEl.style.display='none';mergeBtn.disabled=false;}
  }
})();
