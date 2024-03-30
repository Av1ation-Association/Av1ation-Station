<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
    NLayout,
    NButton,
    NSpace,
    NDivider,
    type FormInst,
    type FormRules,
    NForm,
    NFormItemGi,
    NInput,
    NInputGroup,
    NGrid,
    NSwitch,
    NSelect,
    NInputNumber,
    NH1,
    NH2,
    NH3,
    NSlider,
    NFlex,
} from 'naive-ui';
import { useProjectsStore } from '../stores/projects';
import { type Task, optionsSchema } from '../../../main/src/data/Configuration/Projects';
import { Av1anStatus } from '../../../main/src/utils/Av1an/Av1an';
import { type SVTEncoding, type Encoder } from '../../../main/src/data/Av1an/Types/Options';
import { type Parameters as SVTParameters } from '../../../main/src/data/Av1an/Types/SVT';

// Get id from router parameter
const router = useRouter();
const { id } = router.currentRoute.value.params;

if (!id) {
    console.log('no id');
    router.push('/queue');
}

const projectsStore = useProjectsStore();
const {
    project,
} = storeToRefs(projectsStore);

const queueItemIndex = projectsStore.project.queue.findIndex((item) => item.id === id);

const av1anForm = ref<FormInst>();
const av1anFormRules: FormRules = {
    input: {
        type: 'string',
        required: true,
    },

};
// Custom encoder options
const customSVTParameterNames = ref<{ [key: string]: string }>({});

// Initialize item
projectsStore.project.queue[queueItemIndex].item = {
    ...project.value.queue[queueItemIndex].item,
    logging: project.value.queue[queueItemIndex].item.logging ?? {},
    scenes: project.value.queue[queueItemIndex].item.scenes ?? {},
    chunking: project.value.queue[queueItemIndex].item.chunking ?? {},
    encoding: project.value.queue[queueItemIndex].item.encoding ?? {} as never,
    vmaf: project.value.queue[queueItemIndex].item.vmaf ?? {},
    targetQuality: project.value.queue[queueItemIndex].item.targetQuality ?? {} as never,
};
const maximumSceneLengthNumber = ref(0);
const maximumSceneLengthType = ref('frames');

async function selectInputFile() {
    // Select video or vapoursynth script from file dialog
    const inputFilePaths = await window.configurationsApi['open-file'](projectsStore.project.queue[queueItemIndex].item.input, 'Input Video or VapourSynth Script', [ { name: 'Video Files', extensions: ['mkv', 'avi', 'mp4'] }, { name: 'VapourSynth Script', extensions: ['vpy', 'py'] }, { name: 'All Files', extensions: ['*'] }]);
    if (inputFilePaths.length) {
        project.value.queue[queueItemIndex].item.input = inputFilePaths[0];
    }
}

async function selectOutputFile() {
    // Select output video from file dialog
    const outputFilePath = await window.configurationsApi['save-file'](projectsStore.project.queue[queueItemIndex].item.output, 'Output Video', [{ name: 'MKV (Matroska)', extensions: ['mkv'] }, { name: 'AV1', extensions: ['av1'] }, { name: 'MPEG-4', extensions: ['mp4'] }, { name: 'WebM', extensions: ['webm'] }, { name: 'All Files', extensions: ['*'] }]);
    if (outputFilePath) {
        project.value.queue[queueItemIndex].item.output = outputFilePath;
    }
}

async function selectVMAFModelFile() {
    // Select VMAF model from file dialog
    const defaultPath = projectsStore.project.queue[queueItemIndex].item.vmaf?.path; // TODO: fallback to output directory
    const vmafFilePath = await window.configurationsApi['save-file'](defaultPath, 'VMAF Model');
    if (vmafFilePath) {
        project.value.queue[queueItemIndex].item.vmaf!.path = vmafFilePath;
    }
}

async function selectSVTErrorFile() {
    // Select SVT error file from file dialog
    const defaultPath = (projectsStore.project.queue[queueItemIndex].item.encoding as SVTEncoding).errlog; // TODO: fallback to output directory
    const svtErrorFilePath = await window.configurationsApi['save-file'](defaultPath, 'SVT Error File');
    if (svtErrorFilePath) {
        (project.value.queue[queueItemIndex].item.encoding as SVTEncoding).errlog = svtErrorFilePath;
    }
}

async function selectSVTStatFile() {
    // Select SVT stat file from file dialog
    const defaultPath = (projectsStore.project.queue[queueItemIndex].item.encoding as SVTEncoding)['stat-file']; // TODO: fallback to output directory
    const svtStatFilePath = await window.configurationsApi['save-file'](defaultPath, 'SVT Stat File');
    if (svtStatFilePath) {
        (project.value.queue[queueItemIndex].item.encoding as SVTEncoding)['stat-file'] = svtStatFilePath;
    }
}

async function selectSVTPredictionStructureFile() {
    // Select SVT prediction structure file from file dialog
    const defaultPath = (projectsStore.project.queue[queueItemIndex].item.encoding as SVTEncoding)['pred-struct-file']; // TODO: fallback to output directory
    const svtPredictionStructureFilePath = await window.configurationsApi['save-file'](defaultPath, 'SVT Prediction Structure File');
    if (svtPredictionStructureFilePath) {
        (project.value.queue[queueItemIndex].item.encoding as SVTEncoding)['pred-struct-file'] = svtPredictionStructureFilePath;
    }
}

async function saveAv1anConfig() {
    console.log(project.value.queue[queueItemIndex].item);
    // await av1anForm.value?.validate();
}

</script>

<template>
    <!-- TODO: Add layout sider for links to editing defaults and applying them -->
    <!-- TODO: Add header for queue statistics -->
    <NLayout
        content-style="padding-left: 24px;padding-right: 24px;padding-top: 24px;"
    >
        <NSpace
            justify="space-between"
        >
            <NSpace />
            <NH1>Av1an Configuration</NH1>
            <NButton
                type="primary"
                @click="saveAv1anConfig"
            >
                Save
            </NButton>
        </NSpace>
    </NLayout>
    <NDivider />
    <NLayout
        content-style="padding-left: 24px;padding-right: 24px;padding-bottom: 24px;"
    >
        <NForm
            ref="av1anForm"
            :model="project.queue[queueItemIndex].item"
            :rules="av1anFormRules"
        >
            <NGrid
                :span="24"
                :x-gap="24"
            >
                <NFormItemGi
                    label="Input"
                    path="input"
                    :span="12"
                >
                    <NInputGroup>
                        <NInput
                            v-model:value="project.queue[queueItemIndex].item.input"
                        />
                        <NButton
                            type="primary"
                            @click="selectInputFile"
                        >
                            Select
                        </NButton>
                    </NInputGroup>
                </NFormItemGi>
                <NFormItemGi
                    label="Output"
                    path="output"
                    :span="12"
                >
                    <NInputGroup>
                        <NInput
                            v-model:value="project.queue[queueItemIndex].item.output"
                        />
                        <NButton
                            type="primary"
                            @click="selectOutputFile"
                        >
                            Select
                        </NButton>
                    </NInputGroup>
                </NFormItemGi>
                <NFormItemGi
                    label="Verbosity"
                    path="verbosity"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.verbosity"
                        :clearable="true"
                        :options="[{ label: 'Quiet', value: 'quiet' }, { label: 'Verbose', value: 'verbose' }]"
                        placeholder="None"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Log Level"
                    path="logging.level"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.logging!.level"
                        :clearable="true"
                        :options="[
                            { label: 'Error', value: 'error' },
                            { label: 'Warning', value: 'warning' },
                            { label: 'Info', value: 'info' },
                            { label: 'Debug', value: 'debug' },
                            { label: 'Trace', value: 'trace' },
                        ]"
                        placeholder="Debug"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Maximum Tries"
                    path="maxTries"
                    :span="12"
                >
                    <NInputNumber
                        v-model:value="project.queue[queueItemIndex].item.maxTries"
                        :min="0"
                        :clearable="true"
                        placeholder="3"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Workers"
                    path="workers"
                    :span="12"
                >
                    <NInputNumber
                        v-model:value="project.queue[queueItemIndex].item.workers"
                        :min="0"
                        :clearable="true"
                        placeholder="Auto (0)"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Thread Affinity"
                    path="threadAffinity"
                    :span="12"
                >
                    <NInputNumber
                        v-model:value="project.queue[queueItemIndex].item.threadAffinity"
                        :min="1"
                        :clearable="true"
                        placeholder="None"
                        @update:value="value => {
                            // TODO: Keep track of whether or not thread affinity and lp are tied to each other (when lp is overridden by user)
                            // if (value && !threadAffinitySVTlpOverridden) {
                            //     (project.queue[queueItemIndex].item.encoding! as SVTEncoding).lp = value;
                            // }
                        }"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Pixel Format"
                    path="pixelFormat"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.pixelFormat"
                        :clearable="true"
                        :filterable="true"
                        :options="[
                            { label: 'yuv420p10le', value: 'yuv420p10le' },
                            { label: 'yuv420p8', value: 'yuv420p8' },
                        ]"
                        placeholder="yuv420p10le"
                    />
                </NFormItemGi>
            </NGrid>
            <NH2>Scenes</NH2>
            <NGrid
                :span="24"
                :x-gap="24"
            >
                <!-- #region Scenes -->
                <NFormItemGi
                    label="Split Method"
                    path="scenes.splitMethod"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.scenes!.splitMethod"
                        :clearable="true"
                        :options="[{ label: 'AV Scene Change', value: 'av-scenechange' }, { label: 'None', value: 'None' }]"
                        placeholder="AV Scene Change"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Run Scene Detection Only"
                    path="scenes.detectionOnly"
                    :span="12"
                >
                    <NSwitch
                        v-model:value="project.queue[queueItemIndex].item.scenes!.detectionOnly"
                        :default-value="false"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Detection Method"
                    path="scenes.detectionMethod"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.scenes!.detectionMethod"
                        :clearable="true"
                        :options="[{ label: 'Standard', value: 'standard' }, { label: 'Fast', value: 'fast' }]"
                        placeholder="Standard"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Detection Downscale Height"
                    path="scenes.detectionDownscaleHeight"
                    :span="12"
                >
                    <NInputNumber
                        v-model:value="project.queue[queueItemIndex].item.scenes!.detectionDownscaleHeight"
                        :min="1"
                        :clearable="true"
                        placeholder="Auto"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Detection Pixel Format"
                    path="scenes.detectionPixelFormat"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.scenes!.detectionPixelFormat"
                        :clearable="true"
                        :filterable="true"
                        :options="[
                            { label: 'yuv420p10le', value: 'yuv420p10le' },
                            { label: 'yuv420p8', value: 'yuv420p8' },
                        ]"
                        placeholder="yuv420p10le"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Minimum Scene Length (Frames)"
                    path="scenes.minimumSceneLengthFrames"
                    :span="12"
                >
                    <NInputNumber
                        v-model:value="project.queue[queueItemIndex].item.scenes!.minimumSceneLengthFrames"
                        :min="1"
                        :clearable="true"
                        placeholder="24"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Maximum Scene Length"
                    path="scenes.maximumSceneLength"
                    :span="12"
                >
                    <NInputGroup>
                        <NInputNumber
                            v-model:value="maximumSceneLengthNumber"
                            :clearable="true"
                            :min="0"
                            :placeholder="'Auto'"
                            :on-update:value="(value: number | null) => {
                                if (value === null) {
                                    delete project.queue[queueItemIndex].item.scenes!.maximumSceneLength;
                                    if (maximumSceneLengthType === 'frames') {
                                        maximumSceneLengthNumber = 24;
                                    }
                                    if (maximumSceneLengthType === 'seconds') {
                                        maximumSceneLengthNumber = 10;
                                    }
                                    return;
                                }

                                maximumSceneLengthNumber = value;
                                if (project.queue[queueItemIndex].item.scenes!.maximumSceneLength && 'seconds' in (project.queue[queueItemIndex].item.scenes?.maximumSceneLength as any)) {
                                    project.queue[queueItemIndex].item.scenes!.maximumSceneLength = {
                                        seconds: value,
                                    };
                                } else {
                                    project.queue[queueItemIndex].item.scenes!.maximumSceneLength = {
                                        frames: value,
                                    };
                                }
                            }"
                        />
                        <NSelect
                            v-model:value="maximumSceneLengthType"
                            :options="[
                                { label: 'Seconds', value: 'seconds' },
                                { label: 'Frames', value: 'frames' },
                            ]"
                            default-value="frames"
                            @update:value="(value: string) => {
                                if (project.queue[queueItemIndex].item.scenes?.maximumSceneLength) {
                                    if ('seconds' in (project.queue[queueItemIndex].item.scenes?.maximumSceneLength as any)) {
                                        maximumSceneLengthNumber = (project.queue[queueItemIndex].item.scenes!.maximumSceneLength as any).seconds;
                                    } else if ('frames' in (project.queue[queueItemIndex].item.scenes?.maximumSceneLength as any)) {
                                        maximumSceneLengthNumber = (project.queue[queueItemIndex].item.scenes!.maximumSceneLength as any).frames;
                                    }
                                }
                                if (value === 'seconds') {
                                    project.queue[queueItemIndex].item.scenes!.maximumSceneLength = {
                                        seconds: maximumSceneLengthNumber ?? 10,
                                    };
                                    if (!maximumSceneLengthNumber) {
                                        maximumSceneLengthNumber = 10;
                                    }
                                    maximumSceneLengthType = 'seconds';
                                }
                                if (value === 'frames') {
                                    project.queue[queueItemIndex].item.scenes!.maximumSceneLength = {
                                        frames: maximumSceneLengthNumber ?? 24,
                                    };
                                    if (!maximumSceneLengthNumber) {
                                        maximumSceneLengthNumber = 24;
                                    }
                                    maximumSceneLengthType = 'frames';
                                }
                            }"
                        />
                    </NInputGroup>
                </NFormItemGi>
                <NFormItemGi
                    label="Ignore Scene and Encoder Frame Count Mismatch"
                    path="scenes.ignoreFrameMismatch"
                    :span="12"
                >
                    <NSwitch
                        v-model:value="project.queue[queueItemIndex].item.scenes!.ignoreFrameMismatch"
                        :default-value="false"
                    />
                </NFormItemGi>
                <!-- #endregion Scenes -->
            </NGrid>
            <NH2>Chunking</NH2>
            <NGrid
                :span="24"
                :x-gap="24"
            >
                <NFormItemGi
                    label="Chunking Method"
                    path="chunking.method"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.chunking!.method"
                        :clearable="true"
                        :options="[
                            { label: 'Segment', value: 'segment' },
                            { label: 'Select', value: 'select' },
                            { label: 'FFMS2', value: 'ffms2' },
                            { label: 'L-SmashWorks', value: 'lsmash' },
                            { label: 'Hybrid', value: 'hybrid' },
                            { label: 'DGDecNV', value: 'dgdecnv' },
                            { label: 'BestSource', value: 'bestsource' },
                        ]"
                        placeholder="L-SmashWorks"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Chunking Order"
                    path="chunking.order"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.chunking!.order"
                        :clearable="true"
                        :options="[
                            { label: 'Longest to Shortest', value: 'long-to-short' },
                            { label: 'Shortest to Longest', value: 'short-to-long' },
                            { label: 'Sequential', value: 'sequential' },
                            { label: 'Random', value: 'random' },
                        ]"
                        placeholder="Long to Short"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Chunking Concatenation Method"
                    path="chunking.concatenator"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.chunking!.concatenater"
                        :clearable="true"
                        :options="[
                            { label: 'FFmpeg', value: 'ffmpeg' },
                            { label: 'MKVMerge', value: 'mkvmerge' },
                            { label: 'IVF', value: 'ivf' },
                        ]"
                        placeholder="FFmpeg"
                    />
                </NFormItemGi>
            </NGrid>
            <NH2>VMAF</NH2>
            <NGrid
                :span="24"
                :x-gap="24"
            >
                <NFormItemGi
                    label="VMAF Model Path"
                    path="vmaf.path"
                    :span="12"
                >
                    <NInputGroup>
                        <NInput
                            v-model:value="project.queue[queueItemIndex].item.vmaf!.path"
                        />
                        <NButton
                            type="primary"
                            @click="selectVMAFModelFile"
                        >
                            Select
                        </NButton>
                    </NInputGroup>
                </NFormItemGi>
                <NFormItemGi
                    label="VMAF Resolution"
                    path="vmaf.resolution"
                    :span="12"
                >
                    <NInput
                        v-model:value="project.queue[queueItemIndex].item.vmaf!.resolution"
                        :clearable="true"
                        placeholder="1920x1080"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="VMAF Threads"
                    path="vmaf.threads"
                    :span="12"
                >
                    <NInputNumber
                        v-model:value="project.queue[queueItemIndex].item.vmaf!.threads"
                        :clearable="true"
                        :min="1"
                        placeholder=""
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="VMAF Filter"
                    path="vmaf.filter"
                    :span="12"
                >
                    <NInput
                        v-model:value="project.queue[queueItemIndex].item.vmaf!.filter"
                        :clearable="true"
                        placeholder=""
                    />
                </NFormItemGi>
            </NGrid>
            <NH2>Target Quality</NH2>
            <NGrid
                :span="24"
                :x-gap="24"
            >
                <NFormItemGi
                    label="Target VMAF Score"
                    path="targetQuality.targetVMAFScore"
                    :span="12"
                >
                    <NSlider
                        v-model:value="project.queue[queueItemIndex].item.targetQuality!.targetVMAFScore"
                        :min="0"
                        :max="100"
                        :step="1"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Maximum Probes"
                    path="targetQuality.maxProbes"
                    :span="12"
                >
                    <NInputNumber
                        v-model:value="project.queue[queueItemIndex].item.targetQuality!.maximumProbes"
                        :clearable="true"
                        :min="1"
                        placeholder="4"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Probe Slow"
                    path="targetQuality.probeSlow"
                    :span="12"
                >
                    <NSwitch
                        v-model:value="project.queue[queueItemIndex].item.targetQuality!.probeSlow"
                        :clearable="true"
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Minimum Q"
                    path="targetQuality.minimumQ"
                    :span="12"
                >
                    <NInputNumber
                        v-model:value="project.queue[queueItemIndex].item.targetQuality!.minimumQ"
                        :clearable="true"
                        :min="0"
                        placeholder=""
                    />
                </NFormItemGi>
                <NFormItemGi
                    label="Maximum Q"
                    path="targetQuality.maximumQ"
                    :span="12"
                >
                    <NInputNumber
                        v-model:value="project.queue[queueItemIndex].item.targetQuality!.maximumQ"
                        :clearable="true"
                        :min="0"
                        placeholder=""
                    />
                </NFormItemGi>
            </NGrid>
            <NH2>Encoding</NH2>
            <NGrid
                :span="24"
                :x-gap="24"
            >
                <NFormItemGi
                    label="Encoder"
                    path="encoding.encoder"
                    :span="12"
                >
                    <NSelect
                        v-model:value="project.queue[queueItemIndex].item.encoding!.encoder"
                        :clearable="true"
                        :options="[
                            { label: 'Alliance for Open Media AV1 (aom)', value: 'aom' },
                            { label: 'Scalable Video Technology (svt-av1)', value: 'svt-av1' },
                            { label: 'Rust AV1 Encoder (rav1e)', value: 'rav1e' },
                            { label: 'Alliance for Open Media VP8/VP9 (vpx)', value: 'vpx' },
                            { label: 'Advanced Video Coding (x264)', value: 'x264' },
                            { label: 'High Efficiency Video Coding (x265)', value: 'x265' },
                        ]"
                        placeholder="Alliance for Open Media AV1"
                    />
                    <!-- TODO: Reset object when changing encoder - Optional: Save the previous object in case the user sets it back -->
                </NFormItemGi>
            </NGrid>
            <!-- SVT PARAMS -->
            <template v-if="project.queue[queueItemIndex].item.encoding!.encoder === 'svt-av1'">
                <NH3>General</NH3>
                <NGrid
                    :span="24"
                    :x-gap="24"
                >
                    <NFormItemGi
                        label="Preset (EncoderMode)"
                        path="encoding.preset"
                        :span="12"
                    >
                        <NSlider
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).preset"
                            :min="-3"
                            :max="12"
                            :step="1"
                            :marks="{ '-1': 'Research', 6: 'Recommended', 10: 'Default' }"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Error File"
                        path="encoding.errlog"
                        :span="12"
                    >
                        <NInputGroup>
                            <NInput
                                v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).errlog"
                                :clearable="true"
                            />
                            <NButton
                                type="primary"
                                @click="selectSVTErrorFile"
                            >
                                Select
                            </NButton>
                        </NInputGroup>
                    </NFormItemGi>
                    <NFormItemGi
                        label="Stat File"
                        path="encoding['stat-file']"
                        :span="12"
                    >
                        <NInputGroup>
                            <NInput
                                v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['stat-file']"
                                :clearable="true"
                            />
                            <NButton
                                type="primary"
                                @click="selectSVTStatFile"
                            >
                                Select
                            </NButton>
                        </NInputGroup>
                    </NFormItemGi>
                    <NFormItemGi
                        label="Prediction Structure File"
                        path="encoding['pred-struct-file']"
                        :span="12"
                    >
                        <NInputGroup>
                            <NInput
                                v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['pred-struct-file']"
                                :clearable="true"
                            />
                            <NButton
                                type="primary"
                                @click="selectSVTPredictionStructureFile"
                            >
                                Select
                            </NButton>
                        </NInputGroup>
                    </NFormItemGi>
                    <NFormItemGi
                        label="Progress"
                        path="encoding.progress"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).progress"
                            :clearable="true"
                            :options="[
                                { label: 'None (0)', value: 0 },
                                { label: 'Default (1)', value: 1 },
                                { label: 'AOM style (2)', value: 2 },
                                { label: 'PSY style (3)', value: 3 },
                            ]"
                            placeholder="None"
                        />
                    </NFormItemGi>
                </NGrid>
                <NH3>Global</NH3>
                <NGrid
                    :span="24"
                    :x-gap="24"
                >
                    <NFormItemGi
                        label="Tune"
                        path="encoding.tune"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).tune"
                            :clearable="true"
                            :options="[
                                { label: 'VQ (0)', value: 0 },
                                { label: 'PSNR (1)', value: 1 },
                                { label: 'SSIM (2)', value: 2 },
                                { label: 'Subjective SSIM (PSY Only) (3)', value: 3 },
                            ]"
                            placeholder="PSNR"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Logical Processors"
                        path="encoding.lp"
                        :span="12"
                    >
                        <NInputNumber
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).lp"
                            :clearable="true"
                            :min="0"
                            :default-value="project.queue[queueItemIndex].item.threadAffinity ?? 0"
                            :placeholder="`${project.queue[queueItemIndex].item.threadAffinity ?? `0 (all)`}`"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Input Bit Depth"
                        path="encoding['input-depth']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['input-depth']"
                            :clearable="true"
                            :options="[
                                { label: '8', value: 8 },
                                { label: '10', value: 10 },
                            ]"
                            placeholder="10"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Skip (Frames to be Skipped)"
                        path="encoding.skip"
                        :span="12"
                    >
                        <NInputNumber
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).skip"
                            :clearable="true"
                            :min="0"
                            placeholder="0"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Buffered Input"
                        path="encoding.nb"
                        :span="12"
                    >
                        <NInputNumber
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).nb"
                            :clearable="true"
                            :min="0"
                            placeholder="0"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable High Dynamic Range"
                        path="encoding['enable-hdr']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-hdr']"
                            :clearable="true"
                            :options="[
                                { label: 'No (0)', value: 0 },
                                { label: 'Yes (1)', value: 1 },
                            ]"
                            placeholder="No (0)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Framerate (FPS)"
                        path="encoding.fps"
                        :span="12"
                    >
                        <NInputNumber
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).fps"
                            :clearable="true"
                            :min="1"
                            placeholder="Auto"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Stat Report"
                        path="encoding['enable-stat-report']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-stat-report']"
                            :clearable="true"
                            :options="[
                                { label: 'No (0)', value: 0 },
                                { label: 'Yes (1)', value: 1 },
                            ]"
                            placeholder="No (0)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Fast Decode"
                        path="encoding['fast-decode']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['fast-decode']"
                            :clearable="true"
                            :options="[
                                { label: 'Disable (0)', value: 0 },
                                { label: 'Enable (1)', value: 1 },
                            ]"
                            placeholder="Disable (0)"
                        />
                    </NFormItemGi>
                </NGrid>
                <NH3>Rate Control</NH3>
                <NGrid
                    :span="24"
                    :x-gap="24"
                >
                    <NFormItemGi
                        label="Constant Rate Factor (CRF)"
                        path="encoding.crf"
                        :span="12"
                    >
                        <NSlider
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).crf"
                            :min="1"
                            :max="63"
                            :step="1"
                            :marks="{ 35: 'Default' }"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Adaptive Quantization Mode"
                        path="encoding['aq-mode']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['aq-mode']"
                            :clearable="true"
                            :options="[
                                { label: 'Off (0)', value: 0 },
                                { label: 'Variance base using AV1 segments (1)', value: 1 },
                                { label: 'DeltaQ Pred Efficiency (2)', value: 2 },
                            ]"
                            placeholder="DeltaQ Pred Efficiency (2)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Quantisation Matrices"
                        path="encoding['enable-qm']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-qm']"
                            :clearable="true"
                            :options="[
                                { label: 'No (0)', value: 0 },
                                { label: 'Yes (1)', value: 1 },
                            ]"
                            placeholder="Yes (1)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Minimum Quant Matrix Flatness"
                        path="encoding['qm-min']"
                        :span="12"
                    >
                        <NSlider
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['qm-min']"
                            :min="0"
                            :max="15"
                            :step="1"
                            :marks="{ 0: 'Default' }"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Maximum Quant Matrix Flatness"
                        path="encoding['qm-max']"
                        :span="12"
                    >
                        <NSlider
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['qm-max']"
                            :min="0"
                            :max="15"
                            :step="1"
                            :marks="{ 15: 'Default' }"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Variance Boost Strength"
                        path="encoding['variance-boost-strength']"
                        :span="12"
                    >
                        <NSlider
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['variance-boost-strength']"
                            :min="0"
                            :max="4"
                            :step="1"
                            :default-value="2"
                            :marks="{ 2: 'Default' }"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Variance Octile"
                        path="encoding['variance-octile']"
                        :span="12"
                    >
                        <NSlider
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['variance-octile']"
                            :min="0"
                            :max="8"
                            :step="1"
                            :default-value="6"
                            :marks="{ 6: 'Default' }"
                        />
                    </NFormItemGi>
                </NGrid>
                <NH3>Multi-pass</NH3>
                <NH3>GOP Size and Type</NH3>
                <NGrid
                    :span="24"
                    :x-gap="24"
                >
                    <NFormItemGi
                        label="Keyframe Interval (keyint)"
                        path="encoding.keyint"
                        :span="12"
                    >
                        <NInputNumber
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).keyint"
                            :clearable="true"
                            :min="-2"
                            placeholder="-2 (Auto: ~5 seconds)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Intra Refresh Type"
                        path="encoding['irefresh-type']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['irefresh-type']"
                            :clearable="true"
                            :options="[
                                { label: 'FWD Frame (Open GOP) (1)', value: 1 },
                                { label: 'KEY Frame (Closed GOP) (2)', value: 2 },
                            ]"
                            placeholder="KEY Frame (Closed GOP) (2)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Scene Change Detection"
                        path="encoding.scd"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['scd']"
                            :clearable="true"
                            :options="[
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Disabled (0)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Lookahead"
                        path="encoding.lookahead"
                        :span="12"
                    >
                        <NSlider
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding).lookahead"
                            :min="-1"
                            :max="120"
                            :step="1"
                            :marks="{ '-1': 'Auto (Default)' }"
                        />
                    </NFormItemGi>
                </NGrid>
                <NH3>AV1 Specific</NH3>
                <NGrid
                    :span="24"
                    :x-gap="24"
                >
                    <NFormItemGi
                        label="Film Grain"
                        path="encoding['film-grain']"
                        :span="12"
                    >
                        <NSlider
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['film-grain']"
                            :min="0"
                            :max="50"
                            :step="1"
                            :default-value="0"
                            :marks="{ 0: 'Disabled' }"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Film Grain Denoise"
                        path="encoding['film-grain-denoise']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['film-grain-denoise']"
                            :clearable="true"
                            :options="[
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Disabled (0)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Tile Rows"
                        path="encoding['tile-rows']"
                        :span="12"
                    >
                        <NInputNumber
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['tile-rows']"
                            :clearable="true"
                            :min="0"
                            :max="6"
                            placeholder="0 (Resolution-dependent)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Tile Columns"
                        path="encoding['tile-columns']"
                        :span="12"
                    >
                        <NInputNumber
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['tile-columns']"
                            :clearable="true"
                            :min="0"
                            :max="4"
                            placeholder="0 (Resolution-dependent)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Deblocking Loop Filter"
                        path="encoding['enable-dlf']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-dlf']"
                            :clearable="true"
                            :options="[
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Enabled (1)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Constrained Directional Enhancement Filter"
                        path="encoding['enable-cdef']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-cdef']"
                            :clearable="true"
                            :options="[
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Enabled (1)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Loop Restoration Filter"
                        path="encoding['enable-restoration']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-restoration']"
                            :clearable="true"
                            :options="[
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Enabled (1)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Temporal Dependency Model"
                        path="encoding['enable-tpl-la']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-tpl-la']"
                            :clearable="true"
                            :options="[
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Enabled (1)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Motion Field Motion Vector"
                        path="encoding['enable-mfmv']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-mfmv']"
                            :clearable="true"
                            :options="[
                                { label: 'Auto (-1)', value: -1 },
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Auto (-1)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable ALT-REF (Temporally Filtered) Frames"
                        path="encoding['enable-tf']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-tf']"
                            :clearable="true"
                            :options="[
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Enabled (1)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Enable Overlays"
                        path="encoding['enable-overlays']"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['enable-overlays']"
                            :clearable="true"
                            :options="[
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Disabled (0)"
                        />
                    </NFormItemGi>
                    <NFormItemGi
                        label="Screen Content Detection Level (scm)"
                        path="encoding.scm"
                        :span="12"
                    >
                        <NSelect
                            v-model:value="(project.queue[queueItemIndex].item.encoding! as SVTEncoding)['scm']"
                            :clearable="true"
                            :options="[
                                { label: 'Disabled (0)', value: 0 },
                                { label: 'Enabled (1)', value: 1 },
                            ]"
                            placeholder="Disabled (0)"
                        />
                    </NFormItemGi>
                </NGrid>
                <NH3>Color Description</NH3>
                <NH3>Custom Encoder Parameters</NH3>
                <!-- TODO: Button adds a new form item and also tracks the new item in customSVTParameters Ref -->
            </template>
        </NForm>
    </NLayout>
</template>
