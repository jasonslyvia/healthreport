const { Configuration, OpenAIApi } = require("openai");
const similarity = require('compute-cosine-similarity');
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');

const { calculateChinesePercentage } = require('./utils');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
  basePath: process.env.OPENAI_BASE_PATH,
});
const openai = new OpenAIApi(configuration);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let HISTORY = [];
let tokenCount = 0;

const SYSTEM_PROMPT = `你是一位数据分析师，根据以下内容提取相关数据并回答用户的问题。回答应该简洁明了，不要出现无关的内容。\n\n`;
async function answerQuestion(embeddingCache) {
  rl.question('\n👨🏻: ', async (query) => {
    if (query === 'clear') {
      HISTORY = [];
      console.log(chalk.greenBright('历史记录已清空'));
      return answerQuestion(embeddingCache);
    }

    let finalQuery;
    if (query.trim().startsWith('#')) {
      console.log(chalk.dim(`进入 #追问模式`));
      finalQuery = query.trim().replace(/^#/, '');
    } else {
      console.log(chalk.cyan(`调用 OpenAI 接口生成问题的 embedding`));
      const queryEmbedding = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: query,
      });
  
      const queryEmbeddingData = queryEmbedding.data.data[0].embedding;
      console.log(chalk.green(`问题的 embedding 获取成功`));
  
      console.log(chalk.blue(`开始计算 embedding 相似度`));
      const querySimilarity = Object.entries(embeddingCache).map(([text, embedding]) => {
        const sim = similarity(embedding, queryEmbeddingData);
        return { text, sim };
      });
  
      const top = querySimilarity.sort((a, b) => b.sim - a.sim).slice(0, 10);
      finalQuery = `体检报告\n${top.map(t => t.text).join('\n\n')}\n根据以上内容回答：${query}`;

      console.log(chalk.green(`成功获得 top 文本`));
    }

    console.log(chalk.cyan(`调用 OpenAI 接口回答问题`));

    console.log(chalk.dim(`最终 prompt: ${finalQuery}`));
    HISTORY.push({ role: 'user', content: finalQuery });

    try {
      const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...HISTORY,
        ],
        temperature: 0.2,
      });
  
      console.log(chalk.green('调用成功'));
      const result = response.data?.choices?.[0]?.message?.content;

      if (!result) {
        console.log(chalk.red(`调用出错：${JSON.stringify(response.data, null ,2)}`));
      } else {
        console.log(`🤖: ${result}`);
        const token = response.data.usage.total_tokens;
        tokenCount += token;
        console.log(chalk.yellowBright(`本次消耗 token：${token}`));
      }
  
      HISTORY.push({ role: 'assistant', content: result });
    } catch (err) {
      console.log(chalk.red(`调用出错：${err}`));
    }


    await answerQuestion(embeddingCache);
  });
}

async function generateEmbeddingsByText(text, year, cachePath, embeddingCache) {
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

    if (filteredLines.length > 3) {
      const sections = [];
      for (let i = 0; i < filteredLines.length; i += 3) {
        sections.push(filteredLines.slice(i, i + 3).join('\n'));
      }
      return sections;
    }

    return page;
  }).flat().filter(item => item.trim()).map(item => `${year}年\n${item}`);


  await getEmbeddingsFromOpenAI(cleanedSections, cachePath, embeddingCache);
}

async function generateEmbeddingsByTable(dir, year, cachePath, embeddingCache) {
  const files = fs.readdirSync(dir);
  const csvs = files.filter(file => file.endsWith('.csv'));

  const cleanedCSVs = csvs.map(csv => {
    const content = fs.readFileSync(`${dir}/${csv}`, 'utf8');
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => line.trim());

    if (filteredLines.length > 3) {
      const sections = [];
      for (let i = 0; i < filteredLines.length; i += 3) {
        sections.push(filteredLines.slice(i, i + 3).join('\n'));
      }
      return sections;
    }

    return filteredLines.join('\n');
  }).flat().map(str => `${year}年\n${str}`);

  await getEmbeddingsFromOpenAI(cleanedCSVs, cachePath, embeddingCache);
}


async function getEmbeddingsFromOpenAI(cleanedSections, cachePath, embeddingCache) {
  console.log(chalk.cyan(`将调用 OpenAI 接口生成 ${cleanedSections.length} 个 embedding`));
  const embeddingPromises = cleanedSections.map(section => openai.createEmbedding({
    model: "text-embedding-ada-002",
    input: section,
  }));

  const embeddings = await Promise.all(embeddingPromises);

  embeddings.forEach((embedding, index) => {
    const text = cleanedSections[index];
    embeddingCache[text] = embedding.data.data[0].embedding;
  });
  console.log(chalk.green(`${cleanedSections.length} 个 embedding 获取成功`));

  fs.writeFileSync(cachePath, JSON.stringify(embeddingCache), { flag: 'wx' });
  console.log(chalk.dim(`${cachePath} 已写入缓存`));
}

process.on('exit', () => {
  console.log(chalk.yellowBright(`\n\n本次共消耗 token：${chalk.cyan(tokenCount)}， 约合 ${chalk.cyan((tokenCount / 1000 * 0.002).toFixed(5))} 美元`));
});


module.exports = {
  generateEmbeddingsByText,
  generateEmbeddingsByTable,
  answerQuestion,
}