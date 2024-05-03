const config = require('config');
const { ChatOpenAI, OpenAIEmbeddings } = require('@langchain/openai');
const { JSONLoader } = require('langchain/document_loaders/fs/json');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { createStuffDocumentsChain } = require('langchain/chains/combine_documents')
const { createRetrievalChain } = require('langchain/chains/retrieval');
const { ChatPromptTemplate, PromptTemplate } = require('@langchain/core/prompts');
const { RunnableSequence, RunnableMap, RunnablePassthrough } = require('@langchain/core/runnables');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const {formatDocumentsAsString} = require('langchain/util/document')
const utils = require('./utils');

exports.formatChatHistory = (human, ai, previousChatHistory) => {
	const newInteraction = `Human: ${human}\nAI: ${ai}`;
	if (!previousChatHistory) {
	  return newInteraction;
	}
	return `${previousChatHistory}\n\n${newInteraction}`;
};

//create openAI large language model
exports.createLLM = () => {
	return new ChatOpenAI({
		apiKey: config.OPENAI_API_KEY,
		model: 'gpt-3.5-turbo',
		temperature:0,
	})
};

//load Json file
exports.loadJsonFile = async (path) => {
	const loader = new JSONLoader(path)
	const docs = await loader.load();

	return docs;
}

//split file into chunks, embedding and store into vector store
exports.createRetriever = async (docs) => {
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
  
	// fetch the relevant data from vector store belong to user input
	return vectorStore.asRetriever({ k: 3 });
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

exports.createConversationRetrievalQA = async (model, retriever, prompt) =>{
	const questionPrompt = PromptTemplate.fromTemplate(
		`${prompt}
		----------------
		CONTEXT: {context}
		----------------
		CHAT HISTORY: {chatHistory}
		----------------
		QUESTION: {question}`
	);

	const chain = RunnableSequence.from([
		{
		  question: (input) =>input.question,
		  chatHistory: (input) =>input.chatHistory ?? "",
		  context: async (input) => {
			const relevantDocs = await retriever.invoke(input.question);
			const serialized = formatDocumentsAsString(relevantDocs);
			return serialized;
		  },
		},
		questionPrompt,
		model,
		new StringOutputParser(),
	  ]);

	// add source output to chain  https://js.langchain.com/docs/use_cases/question_answering/sources#adding-sources
	// let ragChainWithSource = new RunnableMap({
	// 	steps: { 
	// 		context: retriever, 
	// 		question: new RunnablePassthrough()
	// 	},
	// });

	// ragChainWithSource = ragChainWithSource.assign({ answer: chain });
	  
	return chain
}


