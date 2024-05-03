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
const inputs = ['我忘記密碼了','是登錄密碼'];
const res = []

async function testRGA() {
	const model = langChain.createLLM();
	const file = await langChain.loadJsonFile("file/20240422-data-text-clean.json");
	const retriever = await langChain.createRetriever(file);
	// const retrievalChain = await langChain.createChain(model, retriever, prompt);
	// const res = await retrievalChain.invoke({ input });
	const conversationChain = await langChain.createConversationRetrievalQA(model, retriever, prompt);

	for (let i=0; i < inputs.length; ++i){
		let response;
		if(i===0){
			response = await conversationChain.invoke({ 
				question: inputs[i],
			});
		}else{
			response = await conversationChain.invoke({ 
				question: inputs[i],
				chatHistory: langChain.formatChatHistory(inputs[i-1], res[i-1]),
			});
		}
		res.push(response)
	}

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


	