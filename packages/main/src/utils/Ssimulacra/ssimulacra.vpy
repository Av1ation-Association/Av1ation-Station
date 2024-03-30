import argparse
import json
import os
import socket
import subprocess
import vapoursynth
from vapoursynth import core

# example: python "ssimulacra.vpy" -"source.mkv" "S01E01.mkv" "scores.json" --threads 0 --width 1280 --height 720 --skip 5 --importer=dgdecnv --source-importer=dgdecnv --encoded-importer=bestsource --method=v2_zig --progress --port=3000

VALID_METHODS = ['v2_zig', 'v2', 'v1']
VALID_IMPORTERS = ['dgdecnv', 'bestsource', 'lsmash', 'ffms2']

# TODO: Add additional methods to validate inputs Example:
# def check_range(value):
#     min_value = 0
#     max_value = 100
#     if value < min_value or value > max_value:
#         raise argparse.ArgumentTypeError(f'Value must be between {min_value} and {max_value}')
#     return value

# parser = argparse.ArgumentParser()
# parser.add_argument('--flag1', type=check_range, help='Description for flag1')

# Parse arguments
parser = argparse.ArgumentParser(prog='VapourSynth SSIMULACRA', description='Calculate SSIMULACRA and SSIMULACRA2 scores between two videos.')
parser.add_argument('source', help='Source video path. Can be relative to this script or a full path.')
parser.add_argument('encoded', help='Encoded video path. Can be relative to this script or a full path.')
parser.add_argument('scores', help='Scores JSON path. Can be relative to this script or a full path. Vapoursynth SSIMULACRA will save the scores to this path in JSON format.')
parser.add_argument('-m', '--method', dest='method', choices=VALID_METHODS, default='v2_zig', help='SSIMULACRA method. Default: v2_zig.')
parser.add_argument('-i', '--importer', dest='importer', choices=VALID_IMPORTERS, default='dgdecnv', help='Video source importer. Default: dgdecnv.')
parser.add_argument('-si', '--source-importer', dest='source_importer', choices=VALID_IMPORTERS, help='Source video importer. Overrides -i (--importer) for the source video.')
parser.add_argument('-ei', '--encoded-importer', dest='encoded_importer', choices=VALID_IMPORTERS, help='Encoded video importer. Overrides -i (--importer) for the encoded video.')
parser.add_argument('-t', '--threads', dest='threads', type=int, default=0, help='Number of threads to use. Default: 0 (auto).')
parser.add_argument('--width', dest='width', type=int, help='Video width to downscale to.')
parser.add_argument('--height', dest='height', type=int, help='Video height to downscale to.')
parser.add_argument('-e', '--every', dest='every', type=int, default=1, help='Frames calculated every nth frame. Default: 1 (Every frame is calculated). For example, setting this to 5 will calculate every 5th frame.')
parser.add_argument('-p', '--port', dest='port', type=int, help='TCP Socket Port the server is listening on. VapourSynth SSIMULACRA will send frame scores to this port in realtime.')
parser.add_argument('--progress', dest='progress', action='store_true', help='Print progress periodically.')
parser.add_argument('--installed', dest='installed', action='store_true', help='Print out a list of dependencies and whether they are installed then exit.')
args = parser.parse_args()

source: str = args.source
encoded: str = args.encoded
scores: str = args.scores
threads: int = args.threads
importer: str = args.importer
source_importer: str = args.source_importer
encoded_importer: str = args.encoded_importer
method: str = args.method
width: int = args.width
height: int = args.height
every: int = args.every
port: int = args.port
progress: bool = args.progress
installed: bool = args.installed

# Check if dependencies are installed
dgdecnv_installed = hasattr(core, 'dgdecodenv')
bestsource_installed = hasattr(core, 'bs')
lsmash_installed = hasattr(core, 'lsmas')
ffms2_installed = hasattr(core, 'ffms2')
ssimulacra2_zig_installed = hasattr(core, 'ssimulacra2')
julek_installed = hasattr(core, 'julek')

if (installed):
    print('Installed Plugins:')
    print('  - dgdecnv: ' + ('Yes' if dgdecnv_installed else 'No'))
    print('  - bestsource: ' + ('Yes' if bestsource_installed else 'No'))
    print('  - lsmash: ' + ('Yes' if lsmash_installed else 'No'))
    print('  - ffms2: ' + ('Yes' if ffms2_installed else 'No'))
    print('  - v2_zig: ' + ('Yes' if ssimulacra2_zig_installed else 'No'))
    print('  - Julek: ' + ('Yes' if julek_installed else 'No'))
    exit(0)

# Get current directory
current_directory = os.getcwd()

# Resolve the source video path
if (os.path.isabs(source)):
    abs_source_path = source
else:
    abs_source_path = os.path.join(current_directory, source)

# Resolve the encoded video path
if (os.path.isabs(encoded)):
    abs_encoded_path = encoded
else:
    abs_encoded_path = os.path.join(current_directory, encoded)

# Resolve the scores JSON path
if (os.path.isabs(scores)):
    abs_scores_path = scores
else:
    abs_scores_path = os.path.join(current_directory, scores)

def import_fallback_selector(original_method: str, fallback_method: str):
    global importer, source_importer, encoded_importer
    if (importer == original_method):
        print(f'Falling back to {fallback_method} importer...')
        importer = fallback_method
    if (source_importer == original_method):
        print(f'Falling back to {fallback_method} for source importer...')
        source_importer = fallback_method
    if (encoded_importer == original_method):
        print(f'Falling back to {fallback_method} for encoded importer...')
        encoded_importer = fallback_method

# Resolve importer selected and check if it exists
# Check if the dgdecnv plugin is installed
if ((importer == 'dgdecnv' or source_importer == 'dgdecnv' or encoded_importer == 'dgdecnv') and not dgdecnv_installed):
    print('The dgdecnv plugin is not installed. Please install it and try again.')
    # Fallback to bestsource
    import_fallback_selector('dgdecnv', 'bestsource')
if ((importer == 'bestsource' or source_importer == 'bestsource' or encoded_importer == 'bestsource') and not bestsource_installed):
    print('The bestsource plugin is not installed. Please install it and try again.')
    # Fallback to lsmash
    import_fallback_selector('bestsource', 'lsmash')
if ((importer == 'lsmash' or source_importer == 'lsmash' or encoded_importer == 'lsmash') and not lsmash_installed):
    print('The lsmash plugin is not installed. Please install it and try again.')
    # Fallback to ffms2
    import_fallback_selector('lsmash', 'ffms2')

# Resolve ssimulacra method
if (method == 'v2_zig' and not ssimulacra2_zig_installed):
    print('The ssimulacra2 plugin is not installed. Please install it and try again.')
    # Fallback to v2
    print('Falling back to v2 or v1 Julek method...')
    method = 'v2'
if ((method == 'v2' or method == 'v1') and not julek_installed):
    print('The julek plugin is not installed. Please install it and try again.')
    exit(1)

# Print out resolved parameters
print('Resolved Parameters:')
print(f'    Source: {abs_source_path}')
print(f'    Encoded: {abs_encoded_path}')
print(f'    Scores: {abs_scores_path}')
print(f'    Importer: {importer}')
print(f'    Source Importer: {source_importer}')
print(f'    Encoded Importer: {encoded_importer}')
print(f'    SSimulacra Method: {method}')

def import_video(absolute_video_path: str, import_method: str):
    global bestsource_installed, lsmash_installed
    print(f'Importing {os.path.basename(absolute_video_path)} with {import_method}...')
    if (import_method == 'dgdecnv'):
        # Index the video with dgindexnv by calling with subprocess
        absolute_dgindex_path = os.path.splitext(absolute_video_path)[0] + '.dgi'
        try:
            # Check if index already exists
            if not os.path.exists(absolute_dgindex_path):
                print(f'Indexing {os.path.basename(absolute_video_path)}...')
                subprocess.run(['dgindexnv', '-h', '-i', absolute_video_path, '-o', absolute_dgindex_path], check=True)
            # Import the video
            return core.dgdecodenv.DGSource(absolute_dgindex_path)
        except FileNotFoundError:
            print('The dgdecnv indexer is not installed. Please install it and try again.')
        except Exception as e:
            print(f'Failed to import video with dgdecnv. Error: {e}')

        # Fallback
        import_method = 'bestsource' if bestsource_installed else 'lsmash' if lsmash_installed else 'ffms2'
        print(f'Falling back to {import_method}...')
    if (import_method == 'bestsource'):
        return core.bs.VideoSource(absolute_video_path, threads=int(threads))
    if (import_method == 'lsmash'):
        return core.lsmas.LWLibavSource(source=absolute_video_path, threads=int(threads), cache=0)
    if (import_method == 'ffms2'):
        return core.ffms2.Source(source=absolute_video_path, cache=False, threads=int(threads if 'threads' != 0 else -1))

def resize_video(clip: vapoursynth.VideoNode, format: vapoursynth.PresetVideoFormat, width: int, height: int, matrix_coefficient: vapoursynth.MatrixCoefficients):
    vid = vapoursynth.VideoNode(clip)
    if (width is not None and height is not None):
        if (matrix_coefficient is not None):
            return clip.resize.Bicubic(width=width, height=height, format=format, matrix_in_s=matrix_coefficient)
        else:
            return clip.resize.Bicubic(width=width, height=height, format=format)
    else:
        if (matrix_coefficient is not None):
            return clip.resize.Bicubic(format=format, matrix_in_s=matrix_coefficient)
        else:
            return clip.resize.Bicubic(format=format)

# Load each video file with the respective selected importer if available
source_clip = import_video(abs_source_path, source_importer if source_importer is not None else importer)
encoded_clip = import_video(abs_encoded_path, encoded_importer if encoded_importer is not None else importer)

# Adjust format and color space for selected method
if (method == 'v1' or method == 'v2'):
    # Only works with RGB24 format.
    source_clip = source_clip.resize.Bicubic(width=width, height=height, format=vapoursynth.RGB24, matrix_in_s='709')
    encoded_clip = encoded_clip.resize.Bicubic(width=width, height=height, format=vapoursynth.RGB24, matrix_in_s='709')
elif (method == 'v2_zig'): # Really, I can't put an "else if" here? This is silly.
    # Only works with RGBS format.
    source_clip = source_clip.resize.Bicubic(width=width, height=height, format=vapoursynth.RGBS, matrix_in_s='709')
    encoded_clip = encoded_clip.resize.Bicubic(width=width, height=height, format=vapoursynth.RGBS, matrix_in_s='709')
    # Must be converted from gamma to linear with fmtc because resize/zimg uses another formula.
    source_clip = source_clip.fmtc.transfer(transs="srgb", transd="linear", bits=32)
    encoded_clip = encoded_clip.fmtc.transfer(transs="srgb", transd="linear", bits=32)
else:
    # Invalid method
    print(f'Invalid method: {method}')
    exit(1)

# Skip every N-1 frames if specified and greater than 1
if (every > 1):
    source_clip = source_clip.std.SelectEvery(cycle=every, offsets=0)
    encoded_clip = encoded_clip.std.SelectEvery(cycle=every, offsets=0)

# Calculate SSIM score
result = source_clip.julek.SSIMULACRA(encoded_clip, feature=1) if method == 'v1' else source_clip.julek.SSIMULACRA(encoded_clip, feature=0) if method == 'v2' else source_clip.ssimulacra2.SSIMULACRA2(encoded_clip)
ssim_scores: list[int] = []

# Calculate standard deviation - Thanks, @Lumen
def calculate_standard_deviation(score_list: list[int]):
    # Filter out scores < 0 - Occurs when a frame is corrupted or mismatched
    filtered_score_list = [score for score in score_list if score >= 0]
    # Returns a tuple containing (average, standard_deviation, median, 5th percentile, 95th percentile)
    average = sum(filtered_score_list)/len(filtered_score_list)
    standard_deviation: float = ((sum([score*score for score in filtered_score_list])/len(filtered_score_list)) - average*average)**0.5
    sorted_score_list = sorted(filtered_score_list)
    return (average, standard_deviation, sorted_score_list[len(filtered_score_list)//2], sorted_score_list[len(filtered_score_list)//20], sorted_score_list[19*len(filtered_score_list)//20])

def calculate(socket_client):
    for index, frame in enumerate(result.frames()):
        score = frame.props['_SSIMULACRA'] if method == 'v1' else frame.props['_SSIMULACRA2']
        # print(f'Frame {index}/{result.num_frames}: {score}')
        ssim_scores.append(score)

        # Send score to server via provided socket client
        if (socket_client is not None):
            socket_client.send(f'{index}/{result.num_frames}: {score}\n'.encode())

        # Print progress every 100 frames
        if (progress and index % 100 == 0):
            (average, standard_deviation, median, percentile_5, percentile_95) = calculate_standard_deviation(ssim_scores)
            print(f'Calculated: {index}/{result.num_frames}\n    Average: {average}\n    Standard Deviation: {standard_deviation}\n    Median: {median}\n    5th Percentile: {percentile_5}\n    95th Percentile: {percentile_95}')

# Connect to TCP Socket server and relay scores
if (port is not None):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as socket_client:
        socket_client.connect(('localhost', int(port)))
        calculate(socket_client)
else:
    calculate(None)

if (progress):
    (average, standard_deviation, median, percentile_5, percentile_95) = calculate_standard_deviation(ssim_scores)
    print(f'Final Scores:\n    Average: {average}\n    Standard Deviation: {standard_deviation}\n    Median: {median}\n    5th Percentile: {percentile_5}\n    95th Percentile: {percentile_95}')

# Save scores as JSON file
with open(abs_scores_path, 'w') as f:
    json.dump({ "scores": ssim_scores }, f)
