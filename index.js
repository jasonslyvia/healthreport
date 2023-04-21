const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const pdf2html = require('pdf2html');

const { preProcessPDFsToTable } = require('./src/pdf_parser');
const { generateEmbeddingsByTable, generateEmbeddingsByText, answerQuestion } = require('./src/open_ai');
// PDF 解析模式， adobe / pdf2html
const PARSE_MODE = process.env.PARSE_MODE || 'text';
let EMVBEDDING_CACHE = {};

(async () => {
  // 读取目录下的 PDF
  const dirs = await fs.promises.readdir(path.resolve(__dirname, './reports'));
  const pdfs = dirs.filter(dir => dir.endsWith('.pdf')).map(dir => path.resolve(__dirname, `./reports/${dir}`));

  // 如果走 adobe 模式，额外调用 adobe 的 API 解析 PDF
  if (PARSE_MODE === 'adobe') {
    await preProcessPDFsToTable(pdfs);
  }

  // 遍历解析后的内容，生成 embedding
  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    const cachePath = pdf.split('.')[0] + '.json';
    const cacheExist = fs.existsSync(cachePath);

    if (cacheExist) {
      console.log(chalk.dim(`从缓存中读取 ${pdf} 的 embedding`));
      const json = JSON.parse(fs.readFileSync(cachePath));
      EMVBEDDING_CACHE = { ...EMVBEDDING_CACHE, ...json };
    } else {
      console.log(chalk.bgWhite(`解析 ${pdf}`));

      const meta = await pdf2html.meta(pdf);
      const createTime = meta['dcterms:created'];
      let year;
      if (createTime) {
        year = createTime.split('-')[0];
      } else {
        year = pdf.match(/\d{4}/)[0];
      }

      if (PARSE_MODE === 'adobe') {
        await preProcessPDFsToTable(pdfs);
        await generateEmbeddingsByTable(
          path.resolve(__dirname, `reports/${pdf.split('.')[0]}/tables`), 
          year, 
          cachePath,
          EMVBEDDING_CACHE
        );
      } else {
        const text = await pdf2html.text(pdf);
        await generateEmbeddingsByText(text, year, cachePath, EMVBEDDING_CACHE);
      }
    }
  }

  console.log(chalk.greenBright('所有准备工作完成，开始提问吧！'));
  console.log(chalk.dim('1. 输入 clear 开始新一轮对话\n2. 在问题前加上 # 可以追问，追问模式将复用上一轮的 embedding'));
  // 开始回答问题
  await answerQuestion(EMVBEDDING_CACHE);
})();

