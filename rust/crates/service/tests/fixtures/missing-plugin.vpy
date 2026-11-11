import vapoursynth as vs

core = vs.core
clip = core.std.BlankClip(format=vs.YUV420P10)
clip = core.hqdn3d.Hqdn3d(clip)
clip.set_output()
