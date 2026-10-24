"""Convert a rigged Meshy character (its *_Meshy_Merged_Animations.fbx) to a small Draco GLB for the game.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
        --python tools/meshy_to_glb.py -- <merged_animations.fbx> assets/characters/<name>.glb

Keeps the mesh, skeleton and every animation (idle, walking, running...), shrinks the 4K textures
(2K colour, 1K for the rest, as JPEG) and makes the material opaque: Meshy also wires the colour map
into Alpha and Emission, which leaves the model see-through in patches and glowing.
Then add the character to CAST in src/cast.js with `model` and `height`.
"""
import sys

import bpy

src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)

for m in bpy.data.materials:
    if not m.node_tree:
        continue
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            for name in ('Alpha', 'Emission Color'):
                for link in list(n.inputs[name].links):
                    m.node_tree.links.remove(link)
            n.inputs['Alpha'].default_value = 1.0
            n.inputs['Emission Strength'].default_value = 0.0

for img in bpy.data.images:
    if img.size[0] == 0:
        continue
    target = 2048 if 'baseColor' in img.name else 1024
    if img.size[0] > target:
        img.scale(target, target)

bpy.ops.export_scene.gltf(
    filepath=out, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_image_format='JPEG', export_jpeg_quality=85, export_skins=True, export_yup=True,
)
print('EXPORTED', out)
