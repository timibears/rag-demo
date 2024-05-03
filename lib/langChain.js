const config = require('config');
const { ChatOpenAI, OpenAIEmbeddings } = require('@langchain/openai');
const { JSONLoader } = require('langchain/document_loaders/fs/json');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { createStuffDocumentsChain } = require('langchain/chains/combine_documents')
const { createRetrievalChain } = require('langchain/chains/retrieval');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { createHistoryAwareRetriever } = require('langchain/chains/history_aware_retriever');
const utils = require('./utils');

//create openAI large language model
exports.createLLM = () => {
	return new ChatOpenAI({
		apiKey: config.OPENAI_API_KEY,
		model: 'gpt-3.5-turbo',
	})
};

//load Json file
exports.loadJsonFile = async (path) => {
	const loader = new JSONLoader(path)
	const docs = await loader.load();

	return docs;
}

//split file into chunks, embedding and store into vector store
exports.createVectorStore = async (docs) => {
	const textSplitter = new RecursiveCharacterTextSplitter({
		chunkSize: 300,
		chunkOverlap: 20
	})

	const splits = await textSplitter.splitDocuments(docs);

	const vectorStore = await MemoryVectorStore.fromDocuments(
		splits,
		new OpenAIEmbeddings({
			apiKey: config.OPENAI_API_KEY,
		})
	);
  
	return vectorStore;
}

exports.createChain = async (model, vectorStore, prompt) => {
	const promptTemplate = ChatPromptTemplate.fromMessages([
		["system", prompt],
		["system", "{context}"],
		["human", "{input}"],
	]);

	// fetch the relevant data from vector store belong to user input
	const retriever = vectorStore.asRetriever();

	const chain = await createStuffDocumentsChain({
		llm: model,
		prompt: promptTemplate
	})

	const retrievalChain = await createRetrievalChain({
		retriever,
		combineDocsChain: chain
	})

	return retrievalChain

	// return ConversationalRetrievalQAChain.fromLLM(
	// 	model,
	// 	vectorStore.asRetriever(),
	// 	{
	// 		memory: new BufferMemory({
	// 		  memoryKey: "chat_history", 
	// 		  inputKey: "question",
	// 		  outputKey: "text"
	// 		}),
	// 		returnSourceDocuments: true,
	// 		qaChainOptions:{
	// 			type: 'stuff',
	// 			prompt: PromptTemplate.fromTemplate(prompt)
	// 		}
	// 	}
	// )
}


