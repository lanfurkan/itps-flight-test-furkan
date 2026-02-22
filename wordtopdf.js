/**
 * wordtopdf.js — DOCX → PDF, high quality via mammoth + PDF.js text layer
 * Renders each "page" at 2x resolution for crisp output
 */
(function(){
  var dropZone=document.getElementById('word-drop-zone');
  var fileInput=document.getElementById('word-file-input');
  var workspace=document.getElementById('word-workspace');
  var filenameEl=document.getElementById('word-filename');
  var previewEl=document.getElementById('word-preview');
  var convertBtn=document.getElementById('word-convert-btn');
  var progressEl=document.getElementById('word-progress');
  var progressFill=document.getElementById('word-progress-fill');
  var progressText=document.getElementById('word-progress-text');
  var resultEl=document.getElementById('word-result');

  var currentFile=null;
  var renderedHtml='';

  dropZone.addEventListener('click',function(){fileInput.click();});
  dropZone.addEventListener('dragover',function(e){e.preventDefault();dropZone.classList.add('drag-over');});
  dropZone.addEventListener('dragleave',function(){dropZone.classList.remove('drag-over');});
  dropZone.addEventListener('drop',function(e){
    e.preventDefault();dropZone.classList.remove('drag-over');
    var f=Array.from(e.dataTransfer.files).find(function(x){return x.name.toLowerCase().endsWith('.docx');});
    if(f)loadFile(f);
  });
  fileInput.addEventListener('change',function(){if(fileInput.files[0])loadFile(fileInput.files[0]);fileInput.value='';});
  convertBtn.addEventListener('click',performConvert);

  async function loadFile(file){
    currentFile=file;filenameEl.textContent=file.name;
    workspace.style.display='block';resultEl.style.display='none';
    previewEl.innerHTML='<p style="color:var(--text-muted)">Yükleniyor...</p>';
    try{
      var ab=await pdfUtils.readFreshBuffer(file);
      var res=await mammoth.convertToHtml({arrayBuffer:ab},{
        styleMap:["p[style-name='Heading 1'] => h1:fresh","p[style-name='Heading 2'] => h2:fresh","p[style-name='Heading 3'] => h3:fresh"]
      });
      renderedHtml=res.value;
      // Show single-page preview at A4 aspect
      previewEl.innerHTML='';
      var frame=document.createElement('div');
      frame.className='word-a4-preview';
      frame.innerHTML=renderedHtml;
      previewEl.appendChild(frame);
    }catch(e){previewEl.innerHTML='<p style="color:var(--red)">Hata: '+e.message+'</p>';}
  }

  async function performConvert(){
    if(!renderedHtml){alert('Önce bir .docx yükleyin.');return;}
    progressEl.style.display='block';resultEl.style.display='none';convertBtn.disabled=true;
    try{
      pdfUtils.setProgress(progressFill,progressText,5,'Hazırlanıyor...');

      // A4 at 96dpi: 794x1123px. We render at 2x for quality: 1588x2246
      var PX_W=794,PX_H=1123,SCALE=2;
      var A4_W=595.28,A4_H=841.89;

      // Create hidden iframe at exact A4 size
      var iframe=document.createElement('iframe');
      iframe.style.cssText='position:fixed;left:-9999px;top:0;width:'+PX_W+'px;height:'+PX_H+'px;border:none;background:#fff;visibility:hidden;';
      document.body.appendChild(iframe);
      var idoc=iframe.contentDocument;
      idoc.open();
      idoc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'+
        '*{box-sizing:border-box;margin:0;padding:0}'+
        'html,body{width:'+PX_W+'px;background:#fff;color:#111;font-family:"Times New Roman",Times,serif;font-size:11pt;line-height:1.5}'+
        'body{padding:48px 54px}'+
        'h1{font-size:18pt;margin:14px 0 8px;font-weight:bold}'+
        'h2{font-size:15pt;margin:12px 0 6px;font-weight:bold}'+
        'h3{font-size:12pt;margin:10px 0 5px;font-weight:bold}'+
        'p{margin:0 0 7px}'+
        'ul,ol{margin:0 0 7px;padding-left:22px}'+
        'li{margin-bottom:3px}'+
        'table{width:100%;border-collapse:collapse;margin:8px 0}'+
        'td,th{border:1px solid #888;padding:3px 6px;font-size:10pt}'+
        'strong,b{font-weight:bold}em,i{font-style:italic}'+
        'img{max-width:100%;height:auto}'+
        '</style></head><body>'+renderedHtml+'</body></html>');
      idoc.close();

      await new Promise(function(r){setTimeout(r,600);});

      var body=idoc.body;
      var totalH=Math.max(body.scrollHeight,PX_H);
      var numPages=Math.max(1,Math.ceil(totalH/PX_H));
      var pdfDoc=await PDFLib.PDFDocument.create();

      pdfUtils.setProgress(progressFill,progressText,15,'Sayfalar render ediliyor...');

      for(var pg=0;pg<numPages;pg++){
        var pct=15+Math.round(pg/numPages*75);
        pdfUtils.setProgress(progressFill,progressText,pct,'Sayfa '+(pg+1)+'/'+numPages+' render...');

        var cvs=document.createElement('canvas');
        cvs.width=PX_W*SCALE;cvs.height=PX_H*SCALE;
        var ctx=cvs.getContext('2d');
        ctx.scale(SCALE,SCALE);
        ctx.fillStyle='#fff';ctx.fillRect(0,0,PX_W,PX_H);

        if(window.html2canvas){
          try{
            var hc=await html2canvas(body,{
              canvas:null,scale:SCALE,useCORS:true,
              scrollY:-(pg*PX_H),
              x:0,y:0,
              width:PX_W,height:PX_H,
              windowWidth:PX_W,windowHeight:PX_H,
              backgroundColor:'#ffffff',logging:false,
              removeContainer:false
            });
            cvs=hc;
          }catch(err){
            // fallback: plain text
            ctx=cvs.getContext('2d');
            ctx.fillStyle='#fff';ctx.fillRect(0,0,cvs.width,cvs.height);
            ctx.fillStyle='#111';ctx.font=(11*SCALE)+'px "Times New Roman"';
            var lines=body.innerText.split('\n').slice(pg*52,(pg+1)*52);
            lines.forEach(function(line,li){ctx.fillText(line.substring(0,80),54*SCALE,(48+li*16)*SCALE);});
          }
        }else{
          // no html2canvas
          ctx=cvs.getContext('2d');
          ctx.fillStyle='#fff';ctx.fillRect(0,0,cvs.width,cvs.height);
          ctx.fillStyle='#111';ctx.font=(11*SCALE)+'px serif';
          var lines2=body.innerText.split('\n').slice(pg*52,(pg+1)*52);
          lines2.forEach(function(line,li){ctx.fillText(line.substring(0,80),54*SCALE,(48+li*16)*SCALE);});
        }

        var dUrl=cvs.toDataURL('image/jpeg',0.92);
        var bin=atob(dUrl.split(',')[1]);
        var bytes=new Uint8Array(bin.length);
        for(var k=0;k<bin.length;k++)bytes[k]=bin.charCodeAt(k);
        var img=await pdfDoc.embedJpg(bytes);
        var p=pdfDoc.addPage([A4_W,A4_H]);
        p.drawImage(img,{x:0,y:0,width:A4_W,height:A4_H});
        cvs.width=0;cvs.height=0;
      }

      document.body.removeChild(iframe);
      pdfUtils.setProgress(progressFill,progressText,95,'Kaydediliyor...');
      var out=await pdfDoc.save();
      pdfUtils.setProgress(progressFill,progressText,100,'Hazır!');
      var url=URL.createObjectURL(new Blob([out],{type:'application/pdf'}));
      pdfUtils.showResult(resultEl,'success','✓ Dönüştürme Tamamlandı',
        numPages+' sayfa · '+pdfUtils.formatSize(out.byteLength),
        [{label:'⬇ PDF İndir',url:url,fn:currentFile.name.replace(/\.docx$/i,'.pdf')}]);
    }catch(e){pdfUtils.showResult(resultEl,'error','Hata',e.message);}
    finally{progressEl.style.display='none';convertBtn.disabled=false;}
  }
})();
