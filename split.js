/**
 * split.js — Click to select pages, download as PDF or ZIP
 */
(function(){
  var dropZone=document.getElementById('split-drop-zone');
  var fileInput=document.getElementById('split-file-input');
  var workspace=document.getElementById('split-workspace');
  var infoEl=document.getElementById('split-info');
  var selAllBtn=document.getElementById('split-select-all');
  var selNoneBtn=document.getElementById('split-select-none');
  var selBar=document.getElementById('split-sel-bar');
  var selCountEl=document.getElementById('split-sel-count');
  var dlOneBtn=document.getElementById('split-dl-one');
  var dlZipBtn=document.getElementById('split-dl-zip');
  var gridEl=document.getElementById('split-grid');
  var progressEl=document.getElementById('split-progress');
  var progressFill=document.getElementById('split-progress-fill');
  var progressText=document.getElementById('split-progress-text');
  var resultEl=document.getElementById('split-result');

  var currentFile=null;
  var totalPages=0;
  var selected=new Set();

  pdfUtils.setupDrop(dropZone,fileInput,'.pdf',function(f){loadFile(f[0]);});
  selAllBtn.addEventListener('click',function(){for(var i=1;i<=totalPages;i++)selected.add(i);syncCards();updateBar();});
  selNoneBtn.addEventListener('click',function(){selected.clear();syncCards();updateBar();});
  dlOneBtn.addEventListener('click',function(){download('single');});
  dlZipBtn.addEventListener('click',function(){download('zip');});

  async function loadFile(file){
    currentFile=file;selected.clear();
    try{
      var doc=await pdfUtils.loadPdfLib(file);
      totalPages=doc.getPageCount();
      infoEl.textContent=file.name+' · '+totalPages+' sayfa';
      workspace.style.display='block';selBar.style.display='none';resultEl.style.display='none';
      renderGrid();
    }catch(e){pdfUtils.showResult(resultEl,'error','PDF yüklenemedi',e.message);}
  }

  function renderGrid(){
    gridEl.innerHTML='';
    for(var i=1;i<=totalPages;i++){
      (function(pn){
        var card=document.createElement('div');card.className='thumb-card';card.dataset.page=pn;
        var chk=document.createElement('div');chk.className='thumb-check';chk.textContent='✓';
        var cvs=document.createElement('canvas');cvs.style.cssText='width:100%;display:block;background:#fff';
        var lbl=document.createElement('div');lbl.className='thumb-label';lbl.textContent='Sayfa '+pn;
        card.appendChild(chk);card.appendChild(cvs);card.appendChild(lbl);
        card.addEventListener('click',function(){
          if(selected.has(pn)){selected.delete(pn);card.classList.remove('selected');}
          else{selected.add(pn);card.classList.add('selected');}
          updateBar();
        });
        gridEl.appendChild(card);
        pdfUtils.renderPageToCanvas(currentFile,pn,0.4,cvs).catch(function(){});
      })(i);
    }
  }

  function syncCards(){
    gridEl.querySelectorAll('.thumb-card').forEach(function(c){
      c.classList.toggle('selected',selected.has(parseInt(c.dataset.page,10)));
    });
  }

  function updateBar(){
    if(selected.size===0){selBar.style.display='none';return;}
    selBar.style.display='flex';
    selCountEl.textContent=selected.size+' sayfa seçildi';
  }

  async function download(mode){
    if(selected.size===0)return;
    var pages=Array.from(selected).sort(function(a,b){return a-b;});
    progressEl.style.display='block';resultEl.style.display='none';
    dlOneBtn.disabled=true;dlZipBtn.disabled=true;
    try{
      var base=currentFile.name.replace(/\.pdf$/i,'');
      if(mode==='single'){
        pdfUtils.setProgress(progressFill,progressText,20,'Building PDF...');
        var src=await pdfUtils.loadPdfLib(currentFile);
        var nd=await PDFLib.PDFDocument.create();
        var cp=await nd.copyPages(src,pages.map(function(p){return p-1;}));
        cp.forEach(function(p){nd.addPage(p);});
        var bytes=await nd.save();
        pdfUtils.setProgress(progressFill,progressText,100,'Done!');
        var url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
        var a=document.createElement('a');a.href=url;a.download=base+'_selected.pdf';a.click();
        pdfUtils.showResult(resultEl,'success','✓ PDF Ready',
          pages.length+' pages · '+pdfUtils.formatSize(bytes.byteLength),[]);
      }else{
        var zip=new JSZip();
        for(var i=0;i<pages.length;i++){
          pdfUtils.setProgress(progressFill,progressText,10+Math.round(i/pages.length*80),'Page '+pages[i]+'...');
          var src2=await pdfUtils.loadPdfLib(currentFile);
          var pd=await PDFLib.PDFDocument.create();
          var cp2=await pd.copyPages(src2,[pages[i]-1]);
          pd.addPage(cp2[0]);
          zip.file(base+'_p'+pages[i]+'.pdf',await pd.save());
        }
        var zb=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
        pdfUtils.setProgress(progressFill,progressText,100,'Done!');
        var zu=URL.createObjectURL(zb);
        var az=document.createElement('a');az.href=zu;az.download=base+'_selected.zip';az.click();
        pdfUtils.showResult(resultEl,'success','✓ ZIP Ready',
          pages.length+' PDFs · '+pdfUtils.formatSize(zb.size),[]);
      }
    }catch(e){pdfUtils.showResult(resultEl,'error','Hata',e.message);}
    finally{progressEl.style.display='none';dlOneBtn.disabled=false;dlZipBtn.disabled=false;}
  }
})();
