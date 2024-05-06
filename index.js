const { program } = require('commander');
const ExcelJS = require('exceljs');
const pLimit = require('p-limit');
const langChain = require('./lib/langChain');
const utils = require('./lib/utils')

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

async function testRAG({path = 'output.xlsx', times = 10} = {}) {
	const limit = pLimit(5);
	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('忘記密碼');
	const testsResult = await Promise.all(
		Array.from({ length: times })
			.map(() => limit(() => runTest({
				model: "gpt-3.5-turbo",
				filePath: "file/20240422-data-text-clean.json",
				messages: ['我充值沒到', 'tim 200'],
				prompt: '你是一位客服，需要回覆用戶提出的问题'
			}))
	))

	worksheet.columns = [
		{header: '問題', key: 'prompt'},
		...(Array.from({ length: times }).map((_, testIndex) => ({
			header: `回應 ${testIndex + 1}`,
			key: `completion${testIndex}`,
		}))),
	];

	const rows = Array.from({length: testsResult[0].length * 3})
	.map((_, index) => {
		const promptIndex = Math.floor(index / 3);
		const isCompletionRow = index % 3 === 0;
		const isDurationRow = index % 3 === 1;
		const isContextRow = index % 3 === 2;
		const result = {
			prompt: testsResult[0][promptIndex].question,
		};

		testsResult.forEach((testResult, testIndex) => {
			if (isCompletionRow) {
				result[`completion${testIndex}`] = testResult[promptIndex].answer;
			} else if (isDurationRow) {
				result[`completion${testIndex}`] = testResult[promptIndex].duration;
			} else if (isContextRow) {
				result[`completion${testIndex}`] = testResult[promptIndex].context.map(({pageContent}) => pageContent).join('\n');
			}
		});

		return result;
	});

	worksheet.addRows(rows);
	testsResult[0].forEach((_, promptIndex) => {
		worksheet.mergeCells(`A${promptIndex * 3 + 2}:A${promptIndex * 3 + 4}`);
	});

	Array.from({length: testsResult[0].length}).forEach((_, index) => {
		worksheet.getRow(2 + index * 3).fill = {
			type: 'pattern',
			pattern:'solid',
			fgColor:{ argb:'cccccc' }
		}
		worksheet.getRow(2 + index * 3).border = {
			top: {style:"thin"},
			left: {style:'thin'},
			bottom: {style:'thin'},
			right: {style:'thin'}
		}
	});

	worksheet.getColumn(1).alignment = {vertical: 'middle', horizontal: 'center' }

	await workbook.xlsx.writeFile(path);
}

async function runTest({prompt, messages = [], model = "gpt-3.5-turbo", filePath = "file/20240422-data-text-clean.json" } = {}){
	const openAIModel = langChain.createLLM({ model, temperature: 1 });
	const file = await langChain.loadJsonFile(filePath);
	const retriever = await langChain.createRetriever(file,{});
	const { chain, memory } = await langChain.createConversationRetrievalQA(openAIModel, retriever, prompt);
	const response = [];

	for(let i=0; i< messages.length; ++i){
		utils.log(messages[i]);

		const start = new Date();

		const res = await chain.invoke(messages[i]);

		res.duration = `${`${(Date.now() - start)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}ms`

		await memory.saveContext({
			input: messages[i],
		},{
			output: res.answer,
		})


		response.push(res);
	}

	return response;
}

async function execute() {
	const { args } = program;

	if (args[0] === 'test') {
		return testRAG({path: args[1]});
	}
}

execute()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});


	