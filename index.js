const { program } = require('commander');
const ExcelJS = require('exceljs');
const pLimit = require('p-limit');

const langChain = require('./lib/langChain');

program
	.name('')
	.usage(`
	-------- Test -----------
	node . test
	`);
program
	.command('start')
	.description('Start chat');
program
	.command('test')
	.description('Start test');
program.parse(process.argv);

const prompt = '你是一位客服，需要回覆使用者提出的問題。';
const input = '忘記密碼';

async function testRGA() {
	const model = langChain.createLLM();
	const file = await langChain.loadJsonFile("file/20240422-data-text-clean.json");
	const vectorStore = await langChain.createVectorStore(file);
	const retrievalChain = await langChain.createChain(model, vectorStore, prompt);
	const res = await retrievalChain.invoke({ input });

	console.log(res)
}



async function execute() {
	const { args } = program;

	if (args[0] === 'start') {
		return start(args[1]);
	}

	if (args[0] === 'test') {
		return testRGA({path: args[1]});
	}
}

execute()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});


	