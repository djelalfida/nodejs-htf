const {
	EventBridgeClient,
	PutEventsCommand,
} = require('@aws-sdk/client-eventbridge');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const {
	TranslateClient,
	TranslateTextCommand,
} = require('@aws-sdk/client-translate');
const {
	ComprehendClient,
	DetectDominantLanguageCommand,
} = require('@aws-sdk/client-comprehend');

/*
Documentation for AWS calls
EventBridge: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-eventbridge/index.html
SQS: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-sqs/index.html
Translate: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-translate/index.html
Comprehend: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-comprehend/index.html
*/

const AWS_REGION = 'eu-west-1';
const PIG_LATIN_SUFFIX = 'ay';
const ENGLISH_LANGUAGE_CODE = 'en';
const EVENT_SOURCE = 'HTF22';

const HANDLERS = {
	Teams: sendToTeams,
	SQS: sendToSQS,
	SendGrid: sendToSendGrid,
};

exports.handler = async (event) => {
	// Log the event so you can view it in CloudWatch
	console.log(event);
	let { message, sendTo } = event.detail;

	//await sendToSQS(message);

	// Step 3: Check what language the message is, translate to English if needed
	const isEnglish = await isMessageInEnglish(message);

	if (!isEnglish) {
		console.log('Message is not in English');
		const sourceLanguage = await getSourceLanugage(message);
		message = await translateToEnglish(message, sourceLanguage);
		console.log('Translated message: ' + message);
	}

	// Step 1: Translate the received message to PigLatin
	const pigTranslatedMessage = translateToPigLatin(message);
	// Tip: Log the translated message so you can view it in CloudWatch
	console.log(pigTranslatedMessage);
	// Step 2: Send the message to the correct Event Rule

	await HANDLERS[sendTo](pigTranslatedMessage);

	const data = await sendToEvent(pigTranslatedMessage);
};

/*
There is no need to use the functions given below, but remember to use clean code as it will be easier to explain :)
*/

async function sendToEvent(message, detailType = 'SendToTeams') {
	const client = new EventBridgeClient({ region: AWS_REGION });
	const command = new PutEventsCommand({
		Entries: [
			{
				Source: EVENT_SOURCE,
				DetailType: detailType,
				Detail: JSON.stringify(message),
				EventBusName: process.env.EventBusName,
			},
		],
	});
	const data = await client.send(command);
	return data;
}

async function sendToSQS(message) {
	// The message that is understood by the SQS
	let messageToSend = {
		translatedMessage: message,
		teamName: process.env.TeamName, // Team name is given as an environment variable
	};

	const client = new SQSClient({ region: AWS_REGION });

	const command = new SendMessageCommand(messageToSend);

	const data = await client.send(command);
}

async function sendToTeams(message) {
	// The message that is understood by the EventBridge rule
	let messageToSend = {
		translatedMessage: message,
		teamName: process.env.TeamName, // Team name is given as an environment variable
	};

	await sendToEvent(messageToSend, 'SendToTeams');
}

async function sendToSendGrid(message) {
	// The format of the message can be found in cfn-students.yaml, you need 2 more attributes than in the "sendToTeams" function
	let messageToSend = {
		translatedMessage: message,
		teamName: process.env.TeamName, // Team name is given as an environment variable
		email: process.env.Email, // Email is given as an environment variable
		teamId: process.env.TeamId, // TeamId is given as an environment variable
	};

	await sendToEvent(messageToSend, 'SendToSendGrid');
}

function translateToPigLatin(message) {
	// Translate
	let translated = message
		.split(' ')
		.map((word) => {
			if (word.length < 2) return word;
			const newWord =
				word.substring(1, word.length) +
				word.substring(1, -1) +
				PIG_LATIN_SUFFIX;
			return (
				newWord.replace(getPunctuation(newWord), '') +
				getPunctuation(newWord).join('')
			);
		})
		.join(' ')
		.toLowerCase();

	translated = capitalizeFirstLetter(translated);

	return translated;
}

function capitalizeFirstLetter(string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

function getPunctuation(message) {
	const punctuation = message.match(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g);
	return punctuation ?? [''];
}

async function isMessageInEnglish(message) {
	// Check if the given message is in English or not using AWS Comprehend
	const client = new ComprehendClient({ region: AWS_REGION });
	const command = new DetectDominantLanguageCommand({ Text: message });
	const data = await client.send(command);

	const isEnglish =
		(await getSourceLanugage(message)) === ENGLISH_LANGUAGE_CODE;

	return isEnglish;
}

async function getSourceLanugage(message) {
	// Check if the given message is in English or not using AWS Comprehend
	const client = new ComprehendClient({ region: AWS_REGION });
	const command = new DetectDominantLanguageCommand({ Text: message });
	const data = await client.send(command);

	const language = data.Languages[0].LanguageCode;

	return language;
}

async function translateToEnglish(message, sourceLanguage) {
	// Translate the message to English using AWS Translate
	const client = new TranslateClient({ region: AWS_REGION });
	const command = new TranslateTextCommand({
		Text: message,
		SourceLanguageCode: sourceLanguage,
		TargetLanguageCode: ENGLISH_LANGUAGE_CODE,
	});
	const data = await client.send(command);

	return data.TranslatedText;
}
