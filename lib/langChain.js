const config = require('config');
const { ChatOpenAI, OpenAIEmbeddings } = require('@langchain/openai');
const { JSONLoader } = require('langchain/document_loaders/fs/json');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { createStuffDocumentsChain } = require('langchain/chains/combine_documents')
const { createRetrievalChain } = require('langchain/chains/retrieval');
const { ChatPromptTemplate,PromptTemplate } = require('@langchain/core/prompts');
const { RunnableSequence, RunnableMap, RunnablePassthrough } = require('@langchain/core/runnables');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { formatDocumentsAsString } = require('langchain/util/document');
const { BufferMemory } = require('langchain/memory')

/**
 * create openAI large language model
 * @param {object} args 
 * @param {string} args.model - model name belong to OpenAI
 * @param {number} args.temperature - (0~2) lower means more determinism, higher means more randomness
 * @returns {ChatOpenAI} 
 */
exports.createLLM = ({ model, temperature = 1} ={}) => {
	return new ChatOpenAI({
		apiKey: config.OPENAI_API_KEY,
		model,
		temperature,
	})
};

/**
 * load Json file
 * @param {string} path - knowledge file path
 * @returns {Array.<Document>}
 */
exports.loadJsonFile = (path) => {
	const loader = new JSONLoader(path)
	return loader.load();
}

/**
 * split file into chunks, embedding and store into memory vector store
 * @param {Array.<Document>} docs - knowledge file
 * @param {object} args 
 * @param {number} args.chunkSize - max chunk size of splitter
 * @param {number} args.chunkOverlap - how much the chunks overlap with each other
 * @param {number} args.k - length of related documents retrieve
 * @returns {VectorStoreRetriever}
 */
exports.createRetriever = async (docs, {chunkSize=300, chunkOverlap=20, k=3} ={}) => {
	const textSplitter = new RecursiveCharacterTextSplitter({
		chunkSize,
		chunkOverlap
	})

	const splits = await textSplitter.splitDocuments(docs);

	const vectorStore = await MemoryVectorStore.fromDocuments(
		splits,
		new OpenAIEmbeddings({
			apiKey: config.OPENAI_API_KEY,
		})
	);

	return vectorStore.asRetriever({ k, searchType: "similarity"});
}

exports.createChain = async (model, retriever, prompt) => {
	const promptTemplate = ChatPromptTemplate.fromMessages([
		["system", prompt],
		["system", "{context}"],
		["human", "{input}"],
	]);

	const chain = await createStuffDocumentsChain({
		llm: model,
		prompt: promptTemplate
	})

	const retrievalChain = await createRetrievalChain({
		retriever,
		combineDocsChain: chain
	})

	return retrievalChain
}

/**
 * create runnable chain
 * @param {ChatOpenAI} model 
 * @param {VectorStoreRetriever} retriever -
 * @param {string} prompt - system prompt
 * @returns {Object.<chain: RunnableSequence, memory: BufferMemory>}
 */
exports.createConversationRetrievalQA = async (model, retriever, prompt) => {
	const memory = new BufferMemory({
		inputKey: "input",
		outputKey: "output",
		memoryKey: "chatHistory"
	});

	const chatPrompt = PromptTemplate.fromTemplate(
		`${prompt}
		----------------
		CONTEXT: {context}
		----------------
		CHAT HISTORY: {chatHistory}
		----------------
		QUESTION: {question}`
	);

	let ragChainWithSource = new RunnableMap({
		steps: { 
			context: retriever, 
			question: new RunnablePassthrough()
		},
	});

	const chain = RunnableSequence.from([
		{
			question: (input) => input.question,
			chatHistory: async () =>{
				const chatHistory = await memory.loadMemoryVariables({});
				return chatHistory.chatHistory;
			},
			context: (input) => formatDocumentsAsString(input.context)
		},
		chatPrompt,
		model,
		new StringOutputParser(),
	]);

	ragChainWithSource = ragChainWithSource.assign({ answer: chain });

	return {chain: ragChainWithSource, memory}
}


