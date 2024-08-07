const { program } = require('commander');
const ExcelJS = require('exceljs');
const pLimit = require('p-limit');
const langChain = require('./lib/langChain');
const utils = require('./lib/utils')

program
	.name('')
	.usage(`
	-------- Test -----------
	node . test 10
	`);
program
	.command('test')
	.description('Start test');
program.parse(process.argv);

async function testRAG({path = 'output.xlsx', times = 10} = {}) {
	const limit = pLimit(10);
	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('忘記密碼');
	const testsResult = await Promise.all(
		Array.from({ length: times })
			.map(() => limit(() => runTest({
				// model: "gpt-3.5-turbo",
				model: "gpt-4-turbo",
				// filePath: "file/20240422-data-text-clean.json",
				// filePath: "file/20240422_數據文本.docx",
				filePath: "file/20240502.txt",
				// messages: ['充值沒到', '帳號:test, 金額:200', '三方, tim'],
				// messages: ['我忘記密碼了', '是資金密碼'],
				prompt: '你是一位客服，需要回覆用戶提出的问题',
				// prompt: '回答我提出的問題，不確定就回答不知道'
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
		const isMetadataRow = index % 3 === 1;
		const isContextRow = index % 3 === 2;
		const result = {
			prompt: testsResult[0][promptIndex].question,
		};

		testsResult.forEach((testResult, testIndex) => {
			if (isCompletionRow) {
				result[`completion${testIndex}`] = testResult[promptIndex].output;
			} else if (isMetadataRow) {
				result[`completion${testIndex}`] = JSON.stringify({
					duration: testResult[promptIndex].duration,
					...testResult[promptIndex].metadata
				},null,2);
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
	const openAIModel = langChain.createLLM({ model, temperature: 0 });
	const file = await langChain.loadKnowledgeFile(filePath);
	const retriever = await langChain.createRetriever(file,{
		chunkSize:100,
		chunkOverlap:30
	});
	const { chain, memory } = await langChain.createConversationRetrievalQA(openAIModel, retriever, prompt);
	const response = [];

	for(let i=0; i< messages.length; ++i){
		utils.log(messages[i]);

		const start = new Date();

		const res = await chain.invoke(messages[i]);

		res.duration = `${`${(Date.now() - start)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}ms`
		res.metadata = res.answer.response_metadata.tokenUsage;
		res.output = res.answer.content;

		await memory.saveContext({
			input: messages[i],
		},{
			output: res.answer.content,
		})


		response.push(res);
	}

	return response;
}

async function execute() {
	const { args } = program;

	if (args[0] === 'test') {
		return testRAG({times: args[1]});
	}
}

execute()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});


	