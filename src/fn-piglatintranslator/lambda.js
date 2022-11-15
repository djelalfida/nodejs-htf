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
	const data = await sendToEvent(pigTranslatedMessage);
};

/*
There is no need to use the functions given below, but remember to use clean code as it will be easier to explain :)
*/

async function sendToEvent(message) {
	const client = new EventBridgeClient({ region: AWS_REGION });
	const params = {
		translatedMessage: message,
		teamName: process.env.TeamName, // Team name is given as an environment variable
	};
	const command = new PutEventsCommand({
		Entries: [
			{
				Source: 'HTF22',
				DetailType: 'SendToTeams',
				Detail: JSON.stringify(params),
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
}

async function sendToSendGrid(message) {
	// The format of the message can be found in cfn-students.yaml, you need 2 more attributes than in the "sendToTeams" function
}

function translateToPigLatin(message) {
	// Translate
	const suffix = 'ay';
	const translated = message
		.split(' ')
		.map((word) => {
			return word.substring(1, word.length) + word.substring(1, -1) + suffix;
		})
		.join(' ')
		.toLowerCase();

	translated.replace(
		translated.substring(0, 1),
		translated.substring(0, 1).toUpperCase()
	);

	return translated;
}

async function isMessageInEnglish(message) {
	// Check if the given message is in English or not using AWS Comprehend
	const client = new ComprehendClient({ region: AWS_REGION });
	const command = new DetectDominantLanguageCommand({ Text: message });
	const data = await client.send(command);

	const isEnglish = (await getSourceLanugage(message)) === 'en';

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
		TargetLanguageCode: 'en',
	});
	const data = await client.send(command);

	return data.TranslatedText;
}
