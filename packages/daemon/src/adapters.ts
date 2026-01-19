import { S3Client } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';
import type { Config } from './config.ts';
import { fileLiveList } from './file-live.ts';
import { type LiveList, ssmLiveList } from './live.ts';
import { spoolUploads } from './spool-uploads.ts';
import { UploadApi } from './upload-api.ts';
import { s3Uploads, type Uploads } from './uploads.ts';

// The upload store and the live list the configuration selects. On AWS
// they are S3 and an SSM parameter; on a plain host, a spool under
// PREVIEWLANE_SPOOL_DIR filled through the control socket, and a JSON file.
export interface Adapters {
	uploads: Uploads;
	live: LiveList;
	// With the spool: the API the control socket serves and the cleanup
	// main.ts runs at startup and on a timer. Absent with S3.
	spool?: UploadApi;
}

export interface AdapterDeps {
	log: (message: string) => void;
}

export function buildAdapters(config: Config, deps: AdapterDeps): Adapters {
	const live = buildLive(config);
	if (config.uploads === 's3') {
		if (config.uploadsBucket === undefined)
			throw new Error('PREVIEWLANE_UPLOADS=s3 needs PREVIEWLANE_UPLOADS_BUCKET');
		return {
			uploads: s3Uploads(config.uploadsBucket, new S3Client({ region: config.region })),
			live,
		};
	}
	if (config.spoolDir === undefined || config.spoolBudgetBytes === undefined) {
		throw new Error('PREVIEWLANE_UPLOADS=spool needs PREVIEWLANE_SPOOL_DIR and PREVIEWLANE_SPOOL_BUDGET_BYTES');
	}
	const spool = new UploadApi({
		spoolDir: config.spoolDir,
		budgetBytes: config.spoolBudgetBytes,
		log: deps.log,
	});
	// The reader's claims go to the API, whose cleanup leaves a claimed
	// entry alone until the deployer's build has copied its source.
	return { uploads: spoolUploads(config.spoolDir, spool), live, spool };
}

function buildLive(config: Config): LiveList {
	if (config.live === 'ssm') {
		if (config.previewsParam === undefined)
			throw new Error('PREVIEWLANE_LIVE=ssm needs PREVIEWLANE_PREVIEWS_PARAM');
		return ssmLiveList(config.previewsParam, new SSMClient({ region: config.region }));
	}
	if (config.liveFile === undefined) throw new Error('PREVIEWLANE_LIVE=file needs PREVIEWLANE_LIVE_FILE');
	return fileLiveList(config.liveFile);
}
