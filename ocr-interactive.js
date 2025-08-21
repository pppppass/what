import interact from 'https://cdn.jsdelivr.net/npm/interactjs@1.10.27/+esm';
interact('.movable')
  .draggable({
    listeners: {
      move (event) {
        const target = event.target;
        const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
        const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
        target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
      },
      end (event) {
        const target = event.target;
        const label = target.getAttribute('data-label');
        const index = pageData.findIndex(b => b.label == label);
        const block = pageData[index];
        const bbox = block.bbox;
        const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
        const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
        bbox.x0 += x / canvas.width;
        bbox.x1 += x / canvas.width;
        bbox.y0 += y / canvas.height;
        bbox.y1 += y / canvas.height;
        Object.assign(target.style, {
          left: bbox.x0 * canvas.width + 'px',
          top: bbox.y0 * canvas.height + 'px',
          width: (bbox.x1 - bbox.x0) * canvas.width + 'px',
          height: (bbox.y1 - bbox.y0) * canvas.height + 'px',
          transform: ''
        });
        target.removeAttribute('data-x');
        target.removeAttribute('data-y');
        deactiveAll();
        if (lazyGlobal)
        {
          block.modified = true;
          target.classList.add('ocr-bbox-modified');
          return ;
        }
        else
        {
          block.modified = false;
          target.classList.remove('ocr-bbox-modified');
          return updateText(block);
        }
      }
    }
  })
  .resizable({
    edges: { left: true, right: true, bottom: true, top: true },
    invert: 'reposition',
    margin: 5,
    listeners: {
      move (event) {
        const target = event.target
        const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.deltaRect.left
        const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.deltaRect.top
        target.style.width = event.rect.width + 'px'
        target.style.height = event.rect.height + 'px'
        target.style.transform = 'translate(' + x + 'px,' + y + 'px)'
        target.setAttribute('data-x', x)
        target.setAttribute('data-y', y)
      },
      end (event) {
        const target = event.target;
        const label = target.getAttribute('data-label');
        const index = pageData.findIndex(b => b.label == label);
        const block = pageData[index];
        const bbox = block.bbox;
        const x = (parseFloat(target.getAttribute('data-x')) || 0)
        const y = (parseFloat(target.getAttribute('data-y')) || 0)
        bbox.x0 += x / canvas.width;
        bbox.x1 = bbox.x0 + event.rect.width / canvas.width;
        bbox.y0 += y / canvas.height;
        bbox.y1 = bbox.y0 + event.rect.height / canvas.height;
        Object.assign(target.style, {
          left: bbox.x0 * canvas.width + 'px',
          top: bbox.y0 * canvas.height + 'px',
          width: (bbox.x1 - bbox.x0) * canvas.width + 'px',
          height: (bbox.y1 - bbox.y0) * canvas.height + 'px',
          transform: ''
        });
        target.removeAttribute('data-x');
        target.removeAttribute('data-y');
        deactiveAll();
        if (lazyGlobal)
        {
          block.modified = true;
          target.classList.add('ocr-bbox-modified');
          return ;
        }
        else
        {
          block.modified = false;
          target.classList.remove('ocr-bbox-modified');
          return updateText(block);
        }
      }
    }
  })
  .on('tap', event => {
    const target = event.target;
    const label = target.getAttribute('data-label');
    if (!activeList.includes(label))
    {
      target.classList.add('ocr-bbox-active');
      activeList.push(label);
    }
    else
    {
      target.classList.remove('ocr-bbox-active');
      const index = activeList.findIndex(l => l == label);
      activeList.splice(index, 1);
    }
  });
let newBboxDiv = null;
let newBboxLeft = null;
let newBboxTop = null;
let newBboxWidth = null;
let newBboxHeight = null;
interact('#ocr-page-canvas')
  .draggable({
    listeners: {
      start (event) {
        const div = document.createElement('div');
        div.classList.add('ocr-bbox');
        newBboxWidth = 0.0;
        newBboxHeight = 0.0;
        newBboxLeft = event.x0 - event.rect.left;
        newBboxTop = event.y0 - event.rect.top;
        Object.assign(div.style, {
          left: newBboxLeft + 'px',
          top: newBboxTop + 'px',
          width: '0px',
          height: '0px',
          position: 'absolute'
        })
        ocrPageContainer.append(div);
        newBboxDiv = div;
      },
      move (event) {
        newBboxWidth += event.dx;
        newBboxHeight += event.dy;
        if (newBboxWidth > 0)
        {
          newBboxDiv.style.left = newBboxLeft + 'px';
          newBboxDiv.style.width = newBboxWidth + 'px';
        }
        else
        {
          newBboxDiv.style.left = (newBboxLeft + newBboxWidth) + 'px';
          newBboxDiv.style.width = (-newBboxWidth) + 'px';
        }
        if (newBboxHeight > 0)
        {
          newBboxDiv.style.top = newBboxTop + 'px';
          newBboxDiv.style.height = newBboxHeight + 'px';
        }
        else
        {
          newBboxDiv.style.top = (newBboxTop + newBboxHeight) + 'px';
          newBboxDiv.style.height = (-newBboxHeight) + 'px';
        }
      },
      end (event) {
        newBboxDiv.remove();
        if (!bookData)
          return ;
        if (newBboxWidth < 0.0)
        {
          newBboxLeft += newBboxWidth;
          newBboxWidth = -newBboxWidth;
        }
        if (newBboxHeight < 0.0)
        {
          newBboxTop += newBboxHeight;
          newBboxHeight = -newBboxHeight;
        }
        if (newBboxWidth < 2.0 || newBboxHeight < 2.0)
          return ;
        const label = String(blockCount+1);
        const bbox = {
          x0: newBboxLeft / canvas.width,
          y0: newBboxTop / canvas.height,
          x1: (newBboxLeft + newBboxWidth) / canvas.width,
          y1: (newBboxTop + newBboxHeight) / canvas.height
        };
        const block = {
          label: label,
          bbox: bbox,
          text: '',
          modified: false,
          trailing: false
        };
        pageData.push(block);
        blockCount += 1;
        const bboxDiv = newBbox(block);
        ocrPageContainer.append(bboxDiv);
        const textDiv = newText(block);
        ocrTextContainer.append(textDiv);
        deactiveAll();
        if (lazyGlobal)
        {
          block.modified = true;
          bboxDiv.classList.add('ocr-bbox-modified');
          return ;
        }
        else
          return updateText(block);
      }
    }
  })
  .styleCursor(false);
let swapPrevTop = null;
let swapThisTop = null;
let swapThisBottom = null;
let swapNextBottom = null;
let swapPrevHeight = null;
let swapThisHeight = null;
let swapNextHeight = null;
function updateSwapBoxes (target) {
  const get = el => {
    const { top, bottom } = el.getBoundingClientRect();
    return { top: top, bottom: bottom, height: bottom - top }
  };
  ( { top: swapThisTop, bottom: swapThisBottom, height: swapThisHeight } = get(target) );
  const prev = target.previousElementSibling;
  if (prev)
    ( { top: swapPrevTop, height: swapPrevHeight } = get(prev) );
  else
    swapPrevTop = -Infinity;
  const next = target.nextElementSibling;
  if (next)
    ( { bottom: swapNextBottom, height: swapNextHeight } = get(next) );
  else
    swapNextBottom = Infinity;
};
interact('.swappable')
  .draggable({
    listeners: {
      move (event) {
        const target = event.target
        let x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
        let y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
        let refresh = false;
        if (swapThisTop + y <= swapPrevTop) {
          target.after(target.previousElementSibling);
          y += swapPrevHeight;
          const label = target.getAttribute('data-label');
          const index = pageData.findIndex(b => b.label == label);
          [pageData[index-1], pageData[index]] = [pageData[index], pageData[index-1]];
          refresh = true;
        }
        else if (swapThisBottom + y >= swapNextBottom) {
          target.before(target.nextElementSibling);
          y -= swapNextHeight;
          const label = target.getAttribute('data-label');
          const index = pageData.findIndex(b => b.label == label);
          [pageData[index], pageData[index+1]] = [pageData[index+1], pageData[index]];
          refresh = true;
        }
        target.style.transform = `translate(${x}px, ${y}px)`;
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
        if (refresh)
          updateSwapBoxes(target);
      },
      end (event)  {
        const target = event.target;
        target.style.transform = '';
        target.removeAttribute('data-x');
        target.removeAttribute('data-y');
      },
      start (event) {
        const target = event.target;
        updateSwapBoxes(target);
      }
    },
  })
