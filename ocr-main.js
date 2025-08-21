let pdfDoc = null;
let pdfName = null;
let pdfNameLong = null;
let pageNum = null;
let pageCount = null;

const ocrPageContainer = document.getElementById('ocr-page-container');
const ocrTextContainer = document.getElementById('ocr-text-container');

const canvas = document.getElementById('ocr-page-canvas');
const canvasContext = canvas.getContext('2d');

document.getElementById('ocr-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file && file.type == 'application/pdf') {
    clearAll();
    const arrayBuf = await file.arrayBuffer();
    e.target.value = '';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
    pdfDoc = pdf;
    pdfNameLong = file.name;
    pdfName = file.name.length <= 40 ? file.name : file.name.slice(0, 27) + '...';
    pageCount = pdf.numPages;
    pageNum = 1;
    bookData = Array.from( { length: pageCount }, (_, __) => ({
      blockCount: null,
      pageData: null
    }) );
    await openPage(1, lazyGlobal);
  }
});

async function drawPage (num) {
  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: 1 });
  const scale = ( document.getElementById('col-left-page').clientWidth - 10) / viewport.width;
  const scaledViewport = page.getViewport({ scale: scale });
  canvas.height = scaledViewport.height;
  canvas.width = scaledViewport.width;
  const renderContext = {
    canvasContext: canvasContext,
    viewport: scaledViewport
  };
  await page.render(renderContext).promise;
  document.getElementById('ocr-page-filename').textContent = pdfName;
  document.getElementById('ocr-page-pagenum').textContent = num.toString();
  document.getElementById('ocr-page-pagecount').textContent = pageCount.toString();
}

let blockCount = null;
let pageData = null;
let bookData = null;

function processText (text) {
  return text
    .replace(/([A-Za-z])-\r?\n([a-z])/g, '$1$2')
    .replace(/\r?\n((\r?\n)*)/g, ' $1')
    .replace(/ +(\r?\n)/g, '$1')
    .replace(/(\r?\n)+$/, '');
}

async function recognizePage (num) {
  ocrTextContainer.classList.add('ocr-text-container-updating');
  const { data } = await tesseractWorker.recognize(canvas, {}, { blocks: true });
  blockCount = data.blocks.length;
  pageData.push(...data.blocks.map((b, id) => ({
    label: String(id+1),
    bbox: {
      x0: b.bbox.x0 / canvas.width,
      y0: b.bbox.y0 / canvas.height,
      x1: b.bbox.x1 / canvas.width,
      y1: b.bbox.y1 / canvas.height
    },
    text: processText(b.text),
    modified: false,
    trailing: false
  })));
}

async function recognizeBox (bbox)
{
  x0 = Math.max(bbox.x0 * canvas.width, 0.0);
  x1 = Math.min(bbox.x1 * canvas.width, canvas.width);
  y0 = Math.max(bbox.y0 * canvas.height, 0.0);
  y1 = Math.min(bbox.y1 * canvas.height, canvas.height);
  if (x1 - x0 < 2.0 || y1 - y0 < 2.0)
    return '';
  const { data } = await tesseractWorker.recognize(canvas, {
    rectangle: { left: x0, top: y0, width: x1 - x0, height: y1 - y0 }
  });
  return processText(data.text);
}

let activeList = null;

function deactiveAll () {
  if (!bookData)
    return ;
  document.querySelectorAll('.ocr-bbox-active').forEach(el => el.classList.remove('ocr-bbox-active'));
  activeList.length = 0;
}

function activateAll ()
{
  if (!bookData)
    return ;
  pageData.forEach(b => {
    const label = b.label;
    if (!activeList.includes(label))
    {
      const bboxDiv = document.querySelector(`.ocr-bbox[data-label="${label}"]`)
      activeList.push(label);
      bboxDiv.classList.add('ocr-bbox-active');
    }
  });
  return;
}

function removeActivated () {
  if (!activeList)
    return ;
  activeList.forEach(label => {
      document.querySelectorAll(`[data-label="${label}"]`).forEach(el => el.remove());
      const index = pageData.findIndex(b => b.label == label);
      pageData.splice(index, 1);
    })
  activeList.length = 0;
}

function mergeActivated (lazy) {
  if (!activeList || activeList.length <= 0)
    return ;
  activeListLength = activeList.length
  const blockActiveList = pageData.filter(b => activeList.includes(b.label));
  const label = activeList[0];
  const index = pageData.findIndex(b => b.label == label);
  const block = pageData[index];
  const bbox = {
    x0: Math.min(...blockActiveList.map(b => b.bbox.x0)),
    x1: Math.max(...blockActiveList.map(b => b.bbox.x1)),
    y0: Math.min(...blockActiveList.map(b => b.bbox.y0)),
    y1: Math.max(...blockActiveList.map(b => b.bbox.y1))
  };
  block.bbox = bbox;
  block.text = blockActiveList.map(b => b.text).join(' ');
  block.modified = lazy && activeListLength > 1;
  block.trailing = blockActiveList.some(b => b.trailing);
  activeList.splice(0, 1);
  removeActivated();
  const bboxDiv = document.querySelector(`.ocr-bbox[data-label="${label}"]`);
  bboxDiv.classList.remove('ocr-bbox-active');
  bboxDiv.classList.toggle('ocr-bbox-modified', block.modified);
  bboxDiv.classList.toggle('ocr-bbox-trailing', block.trailing);
  Object.assign(bboxDiv.style, {
      left: bbox.x0 * canvas.width + 'px',
      top: bbox.y0 * canvas.height + 'px',
      width: (bbox.x1 - bbox.x0) * canvas.width + 'px',
      height: (bbox.y1 - bbox.y0) * canvas.height + 'px',
  });
  const editDiv = document.querySelector(`.ocr-text[data-label="${label}"] > .ocr-text-edit`);
  editDiv.textContent = block.text;
  if (!lazy || activeListLength == 1)
    return updateText(block);
  else
    return ;
}

canvas.addEventListener('click', e => {
  deactiveAll();
});

document.addEventListener('keydown', e => {
  if (e.key == 'Escape')
    deactiveAll();
  else if (e.key == 'Delete')
    removeActivated();
  else if (e.key == 'Enter')
    mergeActivated(lazyGlobal);
})

function newBbox (block)
{
  const bbox = block.bbox;
  const div = document.createElement('div');
  div.classList.add('ocr-bbox', 'movable');
  if (block.modified)
    div.classList.add('ocr-bbox-modified')
  if (block.trailing)
    div.classList.add('ocr-bbox-trailing')
  Object.assign(div.style, {
      left: bbox.x0 * canvas.width + 'px',
      top: bbox.y0 * canvas.height + 'px',
      width: (bbox.x1 - bbox.x0) * canvas.width + 'px',
      height: (bbox.y1 - bbox.y0) * canvas.height + 'px',
  });
  div.setAttribute('data-label', block.label);
  const label = document.createElement('div');
  label.classList.add('ocr-label', 'ocr-bbox-label', 'script-mid');
  label.setAttribute('translate', 'no');
  label.textContent = block.label;
  div.append(label);
  return div;
}

function newText (block)
{
  const div = document.createElement('div');
  div.classList.add('ocr-text', 'swappable');
  div.setAttribute('data-label', block.label);
  const edit = document.createElement('div');
  edit.classList.add('ocr-text-edit', 'editable', 'text-mid');
  edit.textContent = block.text;
  edit.contentEditable = 'true';
  edit.spellcheck = 'true';
  edit.addEventListener('blur', e => {
    const label = block.label;
    const index = pageData.findIndex(b => b.label == label);
    if (pageData[index].text != e.target.textContent)
    {
      pageData[index].text = e.target.textContent;
      pageData[index].modified = true;
      const bboxDiv = document.querySelector(`.ocr-bbox[data-label="${label}"]`);
      bboxDiv.classList.add('ocr-bbox-modified');
    }
  });
  edit.addEventListener('keydown', e => {
    const edit = e.target;
    if (e.key == 'Escape')
    {
      const label = block.label;
      const index = pageData.findIndex(b => b.label == label);
      edit.textContent = pageData[index].text;
      edit.blur();
    }
    else if (e.key == 'Enter' && !e.shiftKey)
      edit.blur();
  });
  div.append(edit);
  const label = document.createElement('div');
  label.classList.add('ocr-label', 'script-mid')
  label.setAttribute('translate', 'no');
  label.textContent = block.label;
  div.append(label);
  return div;
}

async function updateText (block)
{
  const label = block.label;
  const editDiv = document.querySelector(`.ocr-text[data-label="${label}"] > .ocr-text-edit`);
  editDiv.classList.add('ocr-text-edit-updating');
  const text = await recognizeBox(block.bbox);
  block.text = text;
  editDiv.textContent = text;
  editDiv.classList.remove('ocr-text-edit-updating');
}

function drawAll() {
  ocrPageContainer.append(...pageData.map(b => newBbox(b)));
  ocrTextContainer.append(...pageData.map(b => newText(b)));
}

function clearAll() {
  document.querySelectorAll('.ocr-bbox').forEach(el => el.remove());
  document.querySelectorAll('.ocr-text').forEach(el => el.remove());
}

function saveJson ()
{
  bookData[pageNum-1].blockCount = blockCount;
  const blob = new Blob([JSON.stringify({
    pageNum: pageNum,
    bookData: bookData
  }, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfNameLong.replace(/\.pdf$/, '.json');
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openJson ()
{
  const input = document.createElement('input');
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = () => {
    const file = input.files[0];
    if (!file || file.type != 'application/json')
      return ;
    const r = new FileReader();
    r.onload = () => {
      ( { pageNum, bookData } = JSON.parse(r.result) );
      clearAll();
      const num = pageNum;
      activeList = [];
      return ( async () => {
        await drawPage(num);
        await loadPage(num, lazyGlobal);
        drawAll();
        ocrTextContainer.classList.remove('ocr-text-container-updating');
      } ) ();
    };
    r.readAsText(file);
  };
  input.click();
  input.remove();
}

document.addEventListener('keydown', async e => {
  if (e.target.tagName != 'BODY')
    return ;
  const ctrlKey = e.ctrlKey || e.metaKey;
  if (ctrlKey && (e.key == 'a' || e.key == 'A'))
  {
    e.preventDefault();
    activateAll();
  }
  else if (ctrlKey && (e.key == 'r' || e.key == 'R'))
  {
    e.preventDefault();
    if (!bookData)
      return ;
    const num = pageNum;
    bookData[num-1] = {
      blockCount: null,
      pageData: null
    };
    clearAll();
    activeList = [];
    await loadPage(num);
    // if (pageNum == num)
      drawAll();
    ocrTextContainer.classList.remove('ocr-text-container-updating');
  }
  else if (ctrlKey && (e.key == 's' || e.key == 'S'))
  {
    e.preventDefault();
    if (!bookData)
      return ;
    saveJson();
  }
  else if (ctrlKey && (e.key == 'o' || e.key == 'O'))
  {
    e.preventDefault();
    if (!bookData)
      return ;
    openJson();
  }
  else if (e.key == 'ArrowRight')
  {
    if (bookData && pageNum + 1 <= pageCount)
      await openPage(pageNum+1, lazyGlobal);
  }
  else if (e.key == 'ArrowLeft')
  {
    if (bookData && pageNum - 1 > 0)
      await openPage(pageNum-1, lazyGlobal);
  }
  else if (e.key == 'Shift')
  {
    lazyGlobal = !lazyGlobal;
    document.getElementById('ocr-page-lazy').classList.toggle('ocr-lazy-on', lazyGlobal);
  }
});

document.addEventListener('keyup', e => {
  if (e.target.tagName != 'BODY')
    return ;
  if (e.key == 'Shift')
  {
    lazyGlobal = !lazyGlobal;
    document.getElementById('ocr-page-lazy').classList.toggle('ocr-lazy-on', lazyGlobal);
  }
});

function loadPage (num, lazy)
{
  if (!bookData[num-1].pageData)
  {
    bookData[num-1] = {
      blockCount: 0,
      pageData: []
    };
    ( { blockCount, pageData } = bookData[num-1] );
    if (!lazy)
      return recognizePage(num);
  }
  else
    ( { blockCount, pageData } = bookData[num-1] );
}

async function openPage(num, lazy) {
  bookData[pageNum-1].blockCount = blockCount;
  clearAll();
  pageNum = num;
  activeList = [];
  await drawPage(num);
  await loadPage(num, lazy);
  drawAll();
  ocrTextContainer.classList.remove('ocr-text-container-updating');
}

const ocrPagePagenum = document.getElementById('ocr-page-pagenum');

ocrPagePagenum.addEventListener('blur', async e => {
  const target = e.target;
  if (!bookData)
  {
    target.textContent = '-';
    return ;
  }
  const newPageNum = parseInt(target.textContent);
  if (newPageNum && newPageNum <= pageCount && newPageNum > 0)
    await openPage(newPageNum, lazyGlobal);
  else
    target.textContent = pageNum.toString();
})

ocrPagePagenum.addEventListener('keydown', e => {
  if (e.key == 'Enter')
    e.target.blur();
});

document.getElementById('ocr-page-next').addEventListener('click', e => {
  if (bookData && pageNum + 1 <= pageCount)
    return openPage(pageNum+1, lazyGlobal);
})

document.getElementById('ocr-page-prev').addEventListener('click', e => {
  if (bookData && pageNum - 1 > 0)
    return openPage(pageNum-1, lazyGlobal);
})

document.getElementById('ocr-page-lazy').addEventListener('click', e => {
  lazyGlobal = !lazyGlobal;
  document.getElementById('ocr-page-lazy').classList.toggle('ocr-lazy-on', lazyGlobal);
})

document.getElementById('ocr-page-merge').addEventListener('click', e => {
  if (!bookData)
    return ;
  mergeActivated(lazyGlobal);
})

document.getElementById('ocr-page-delete').addEventListener('click', e => {
  if (!bookData)
    return ;
  removeActivated();
})

document.getElementById('ocr-page-refresh').addEventListener('click', async e => {
  if (!bookData)
    return ;
  removeActivated();
  const num = pageNum;
  bookData[num-1] = {
    blockCount: null,
    pageData: null
  };
  clearAll();
  activeList = [];
  ocrTextContainer.classList.add('ocr-text-container-updating');
  await loadPage(num);
  // if (pageNum == num)
    drawAll();
  ocrTextContainer.classList.remove('ocr-text-container-updating');
})

document.getElementById('ocr-page-save').addEventListener('click', e => {
  if (!bookData)
    return ;
  saveJson();
})
document.getElementById('ocr-page-open').addEventListener('click', e => {
  if (!bookData)
    return ;
  openJson();
})

let lazyGlobal = false;
