let library;
function loadLibrary() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = new URL('./vendor/ocr/tesseract.min.js', import.meta.url).href;
    script.onload = () => resolve(globalThis.Tesseract);
    script.onerror = () => { script.remove(); library = null; reject(new Error('识别组件加载失败，请检查服务是否已更新，或稍后重试')); };
    document.head.append(script);
  });
  return library;
}

export function suggestSubject(text) {
  const value = text.toLowerCase().replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g, '$1');
  const rules = {
    408: /数据结构|二叉树|链表|哈希|计算机组成|操作系统|计算机网络|死锁|页表|虚拟内存|进程|线程|高速缓存|指令流水线|cache\b|tcp\b|udp\b|cpu\b|路由器|子网掩码|磁盘调度|栈与队列/g,
    数学: /极限|导数|微分|积分|矩阵|行列式|概率|随机变量|方程|函数|无穷|数列|级数|线性代数|向量|sin\b|cos\b|tan\b|lim\b|∫|∑|求证|证明/g,
    政治: /马克思|社会主义|毛泽东|习近平|辩证|唯物|矛盾|生产关系|生产力|历史观|哲学|宪法|思想道德|中国共产党|资本主义|革命|政治|党的/g,
    英语: /reading|comprehension|passage|vocabulary|translate|translation|paragraph|according to|choose|sentence|英语|阅读理解|完形填空|长难句/g,
  };
  const scores = Object.entries(rules).map(([subject, rule]) => ({subject, score: (value.match(rule) || []).length * (subject==='408'?5:3)}));
  const englishLetters = (text.match(/[A-Za-z]/g) || []).length;
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  if (englishLetters > 45 && englishLetters > chinese * 3) scores.find(item => item.subject === '英语').score += 4;
  scores.sort((a, b) => b.score - a.score);
  if (scores[0].score < 3 || scores[0].score === scores[1].score) return null;
  return scores[0].subject;
}

export async function recognizeImage(image, { signal, onProgress = () => {}, language = 'chi_sim+eng' } = {}) {
  let worker, timer, finished = false, abortHandler;
  const interrupted = new Promise((resolve, reject) => {
    abortHandler = () => reject(new DOMException('识别已取消', 'AbortError'));
    if (signal?.aborted) abortHandler();
    else signal?.addEventListener('abort', abortHandler, { once: true });
    timer = setTimeout(() => reject(new Error('识别时间较长，请尝试裁小图片或稍后重试；原图仍可保存')), 120000);
  });
  const task = (async () => {
    const engine = await loadLibrary();
    if (finished || signal?.aborted) throw new DOMException('识别已取消', 'AbortError');
    worker = await engine.createWorker(language, 1, {
      workerPath: new URL('./vendor/ocr/worker.min.js', import.meta.url).href, corePath: new URL('./vendor/ocr/core', import.meta.url).href, langPath: new URL('./vendor/ocr/lang', import.meta.url).href,
      workerBlobURL: false, cachePath: 'shiti-offline-ocr-v7',
      logger(message) {
        if (finished) return;
        const recognizing = message.status === 'recognizing text';
        onProgress(recognizing ? `正在识别文字 ${Math.round((message.progress || 0) * 100)}%` : '正在准备中英文识别模型…');
      },
      errorHandler() { /* The job promise reports errors to the form. */ },
    });
    if (finished || signal?.aborted) { await worker.terminate(); worker = null; throw new DOMException('识别已取消', 'AbortError'); }
    const { data } = await worker.recognize(image, { rotateAuto: true }, { text: true });
    const text = (data.text || '').replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g, '$1').trim().slice(0, 20000);
    return { text, confidence: data.confidence, subject: suggestSubject(text) };
  })();
  try { return await Promise.race([task, interrupted]); }
  finally {
    finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abortHandler);
    if (worker) await worker.terminate().catch(() => {});
  }
}
