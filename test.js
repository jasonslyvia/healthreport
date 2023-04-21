const pdf2html = require('pdf2html');
const { Configuration, OpenAIApi } = require("openai");
const similarity = require('compute-cosine-similarity');
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');
const tiktoken = require('tiktoken-node');

const { calculateChinesePercentage } = require('./utils');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
  basePath: process.env.OPEBAI_BASE_PATH,
});
const openai = new OpenAIApi(configuration);

const WHITE_LIST = [
  '参考区间',
  '参考值',
  '参考范围',
];

let EMVBEDDING_CACHE = {};

async function readReports() {
  const dirs = await fs.promises.readdir('reports');
  return dirs.filter(dir => dir.endsWith('.pdf'));
}

(async () => {
  const pdfs = await readReports();
  console.log(chalk.bgWhite('开始解析报告'));
  console.log(chalk.bgWhite(`共有 ${pdfs.length} 份报告`));

  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    const cachePath = 'cache/' + pdf.split('.')[0] + '.json';
    const cacheExist = fs.existsSync(cachePath);

    if (cacheExist) {
      console.log(chalk.dim(`从缓存中读取 ${pdf} 的 embedding`));
      const json = JSON.parse(fs.readFileSync(cachePath));
      EMVBEDDING_CACHE = { ...EMVBEDDING_CACHE, ...json };
    } else {
      console.log(chalk.bgWhite(`解析 ${pdf}`));

      const text = await pdf2html.text(`reports/${pdf}`);
      const meta = await pdf2html.meta(`reports/${pdf}`);

      const createTime = meta['dcterms:created'];
      let year;
      if (createTime) {
        year = createTime.split('-')[0];
      } else {
        year = pdf.match(/\d{4}/)[0];
      }

      // await generateEmbeddingsByText(text, year, cachePath);
      await generateEmbeddingsByTable(`reports/output/${pdf.split('.')[0]}/tables`, year, cachePath);
    }
  }

  await answerQuestion();
})();


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const HISTORY = [];
async function answerQuestion() {
  rl.question('👨🏻: ', async (query) => {
    HISTORY.push(query);
    console.log(chalk.cyan(`调用 OpenAI 接口生成问题的 embedding`));
    const queryEmbedding = await openai.createEmbedding({
      model: "text-embedding-ada-002",
      input: query,
    });

    const queryEmbeddingData = queryEmbedding.data.data[0].embedding;
    console.log(chalk.green(`问题的 embedding 获取成功`));

    console.log(chalk.blue(`开始计算 embedding 相似度`));
    const querySimilarity = Object.entries(EMVBEDDING_CACHE).map(([text, embedding]) => {
      const sim = similarity(embedding, queryEmbeddingData);
      return { text, sim };
    });

    // extract top sim item from querySimilarity
    const top = querySimilarity.sort((a, b) => b.sim - a.sim).slice(0, 10);
    console.log(chalk.green(`成功获得 top 文本`));
    // console.log(chalk.dim(`top 相似文本：${util.inspect(top)}`));

    // ask openai to generate response
    console.log(chalk.cyan(`调用 OpenAI 接口回答问题`));

    const finalQuery = `你是一位专业的医生，根据以下体检报告回答用户的问题，你的回答应该引用体检报告中的原文，尤其是具体数据。回答应该简洁明了，不要出现无关的内容。
体检报告\n\n${top.map(t => t.text).join('\n\n')}\n根据以上内容回答：${query}`;
    console.log(chalk.dim(`最终 prompt: ${finalQuery}`));

    try {
      const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          { role: 'user', content: finalQuery },
        ],
        temperature: 0.2,
      });
  
      console.log(chalk.green('调用成功'));
      const result = response.data.choices[0].message.content;
  
      console.log(`🤖: ${result}`);
      console.log(chalk.yellowBright(`本次消耗 token：${response.data.usage.total_tokens}`));
  
      HISTORY.push(result);
    } catch (err) {
      console.log(chalk.red(`调用出错：${err}`));
    }


    await answerQuestion();
  });
}

async function generateEmbeddingsByText(text, year, cachePath) {
  // 大概按照每页分割
  const pages = text.split('\n\n\n');

  const cleanedPages = pages
    .map(item => item.replace(/\n\n/g, '\n'))
    .map(item => item.replace(/检测机构\s*[:：]\s*\S+/g, ''))
    .map(item => item.replace(/检测时间\s*[:：]\s*\S+\s*\S+/g, ''))
    .map(item => item.replace(/报告时间\s*[:：]\s*\S+\s*\S+/g, ''))
    .map(item => item.replace(/(咨询)?电话\s*[:：]\s*\S+\s*\S+/g, ''))
    // .filter(item => item && WHITE_LIST.some(l => item.includes(l)))
    ;

  // 将超长的文本再次分割
  const cleanedSections = cleanedPages.map(page => {
    const lines = page.split('\n');
    // 如果一行里面 90% 都是中文，大概率是介绍性文字，不需要
    const filteredLines = lines.filter(line => calculateChinesePercentage(line) < 90).filter(line => line.trim());

    if (filteredLines.length > 10) {
      // 将 filteredLines 拆分成 10 个一组
      const sections = [];
      for (let i = 0; i < filteredLines.length; i += 10) {
        sections.push(filteredLines.slice(i, i + 10).join('\n'));
      }
      return sections;
    }

    return page;
  }).flat().filter(item => item.trim()).map(item => `${year}年\n${item}`);


  await getEmbeddingsFromOpenAI(cleanedSections, cachePath);
}

async function generateEmbeddingsByTable(dir, year, cachePath) {
  const files = fs.readdirSync(dir);
  const csvs = files.filter(file => file.endsWith('.csv'));

  const cleanedCSVs = csvs.map(csv => {
    const content = fs.readFileSync(`${dir}/${csv}`, 'utf8');
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => line.trim());

    if (filteredLines.length > 8) {
      // 将 filteredLines 拆分成 8 行一组
      const sections = [];
      for (let i = 0; i < filteredLines.length; i += 8) {
        sections.push(filteredLines.slice(i, i + 8).join('\n'));
      }
      return sections;
    }

    return filteredLines.join('\n');
  }).flat().map(str => `${year}年\n${str}`);

  await getEmbeddingsFromOpenAI(cleanedCSVs, cachePath);
}


async function getEmbeddingsFromOpenAI(cleanedSections, cachePath) {
  console.log(chalk.cyan(`将调用 OpenAI 接口生成 ${cleanedSections.length} 个 embedding`));
  const embeddingPromises = cleanedSections.map(section => openai.createEmbedding({
    model: "text-embedding-ada-002",
    input: section,
  }));

  const embeddings = await Promise.all(embeddingPromises);

  embeddings.forEach((embedding, index) => {
    const text = cleanedSections[index];
    EMVBEDDING_CACHE[text] = embedding.data.data[0].embedding;
  });
  console.log(chalk.green(`${cleanedSections.length} 个 embedding 获取成功`));

  fs.writeFileSync(cachePath, JSON.stringify(EMVBEDDING_CACHE), { flag: 'wx' });
  console.log(chalk.dim(`${cachePath} 已写入缓存`));
}
