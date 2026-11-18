# NAC 数据来源与导入

## 内置数据

内置数据锁定 GTNH 2.9.0 首个正式版。清单指定 GT5-Unofficial 5.09.54.265、NewHorizonsCoreMod 2.9.99 和 NotEnoughItems 2.8.171-GTNH。应用本地保存 11 类模块的方块布局和纹理、24 个电路成品、148 条 NAC 加工配方以及 256 条控制室组件转换记录。

- [GTNH 2.9.0 正式版](https://github.com/GTNewHorizons/GT-New-Horizons-Modpack/releases/tag/2.9.0)
- [正式版模组清单](https://github.com/GTNewHorizons/DreamAssemblerXXL/blob/master/releases/manifests/2.9.0.json)
- [中文 Wiki 的 NAC 结构和路由](https://gtnh.huijiwiki.com/wiki/NAC)
- [2.9.0 所用的 CoreMod 配方](https://github.com/GTNewHorizons/NewHorizonsCoreMod/blob/2.9.99/src/main/java/com/dreammaster/scripts/ScriptNanochipRecipes.java)
- [2.9.0 所用的 GT5U 模块和物流源码](https://github.com/GTNewHorizons/GT5-Unofficial/tree/5.09.54.265/src/main/java/gregtech/common/tileentities/machines/multi/nanochip)
- [社区简体中文汉化](https://github.com/GTNewHorizons/GTNH-Translations/tree/4b4adcaf484075686209331d16dafc7eccfdc0a5/zh_CN)

名称以中文 Wiki、原版简体中文和 GTNH 汉化库为依据。物品和 GUI 纹理来自原版模组资源。结构预览由源码中的方块布局和原版纹理生成，通用纹理按材料颜色着色。GT5-Unofficial 使用 [LGPL-3.0](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/LICENSE.txt)，CoreMod 和汉化库使用 [GPL-3.0](https://github.com/GTNewHorizons/NewHorizonsCoreMod/blob/2.9.99/LICENSE)。

各电路族的精校说明和光学模块的净化水描述参照 [中文 Wiki 校准表](https://gtnh.huijiwiki.com/wiki/NAC#校准效果) 和 [光学优化组织器条目](https://gtnh.huijiwiki.com/wiki/Project:沙盒/条目/多方块结构预备/光学优化组织器)。倍率和阈值与 [GT5U 5.09.54.265 精校源码](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/src/main/java/gregtech/common/tileentities/machines/multi/nanochip/util/CircuitCalibration.java#L12-L67) 核对。

画布和布线预览使用同一套原版底座坐标。以主体中心为原点、向东和向南为正，从右上 01 顺时针，各槽中心坐标为 `(8,-23)、(17,-17)、(23,-8)、(23,8)、(17,17)、(8,23)、(-8,23)、(-17,17)、(-23,8)、(-23,-8)、(-17,-17)、(-8,-23)`，单位为方块。13 个底座的外接范围为 53 × 53 格。 [中文 Wiki 路由样板](https://gtnh.huijiwiki.com/wiki/指南:纳米芯片组装复合体自动化/原始) · [GT5U 5.09.54.265 整体结构定义](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/src/main/java/gregtech/common/tileentities/machines/multi/nanochip/util/AssemblyComplexStructureString.java)

拼音搜索按 Not Enough Characters 默认的全拼匹配方式实现，支持混用汉字、首字母和全拼，并补充了整合包元素名称中的生僻字读音。字符读音表由 MIT 许可的 pinyin-data v0.15.0 生成并随应用打包。 [Not Enough Characters](https://github.com/GTNewHorizons/NotEnoughCharacters) · [PinIn](https://github.com/Towdium/PinIn) · [pinyin-data v0.15.0](https://github.com/mozillazg/pinyin-data/tree/v0.15.0)

内置目录含 154 个动画图标，其中 45 个为流体。帧动画按游戏资源的 `.png.mcmeta` 读取播放顺序、每帧持续时间及插值。流体和材料图标按原版材质着色，IC2 冷却液和 UU 物质使用整合包指定的 IC2 版本资源。超时空金属旋转、六相铜色移和宇宙素星空等运行时效果采用固定视角的循环图标。 [GT5-Unofficial 素材元数据](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/src/main/resources/assets/gregtech/textures/items/gt.circuitcomponent/processed/processedwirehypogen.png.mcmeta) · [GTNHLib 星空着色器](https://github.com/GTNewHorizons/GTNHLib/blob/0.11.54/src/main/resources/assets/gtnhlib/shaders/avaritia/universium.frag) · [IC2 原版归档](https://downloads.gtnewhorizons.com/Mods_for_Twitch/industrialcraft-2-2.2.828a-experimental.jar)

1x 导线和光纤线缆按游戏的物品栏几何与方块纹理生成 128×128 立体图标，截面分别为 1/8 和 3/8 方块。细导线保留原版 `wireFine` 的单圈卷线、突出线头与叠层，处理后沿用原版线轴。螺丝和螺栓按原图有效区域放大，动画使用各帧共同的取景范围。超时空金属采用有厚度的旋转模型，彩色玻璃螺栓按原版颜色循环。贴片沿用原版静态像素图。 [导线和线缆的物品栏渲染](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/src/main/java/gregtech/api/metatileentity/MetaPipeEntity.java#L151-L175) · [1x 无尽导线注册参数](https://github.com/GTNewHorizons/NewHorizonsCoreMod/blob/2.9.99/src/main/java/com/dreammaster/gthandler/GT_Loader_Wires.java#L41-L66) · [光纤线缆原版实现](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/src/main/java/tectech/thing/metaTileEntity/pipe/MTEPipeData.java) · [原版细导线纹理](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/src/main/resources/assets/gregtech/textures/items/materialicons/NONE/wireFine.png) · [超时空金属旋转渲染](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/src/main/java/gregtech/common/render/items/TranscendentMetalRenderer.java#L141-L173) · [彩色玻璃螺栓动画](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/src/main/resources/assets/gregtech/textures/items/materialicons/CUSTOM/chromaticglass/bolt.png.mcmeta)

光学优化组织器对照中文 Wiki 的交互结构，采用 2.9.0 正式版方块布局和游戏原版连接纹理绘制。所有模块共享等距视角和方块比例，透明底图保留网格接口的青色连纹与玻璃接缝，可离线显示。 [中文 Wiki 的光学优化组织器](https://gtnh.huijiwiki.com/wiki/Project:沙盒/条目/多方块结构预备/光学优化组织器) · [正式版光学结构定义](https://github.com/GTNewHorizons/GT5-Unofficial/blob/5.09.54.265/src/main/java/gregtech/common/tileentities/machines/multi/nanochip/modules/MTEOpticalOrganizerModule.java#L49-L69) · [网格接口连接纹理](https://github.com/GTNewHorizons/GT5-Unofficial/tree/5.09.54.265/src/main/resources/assets/gregtech/mcpatcher/ctm/blockcasings12/nanochipmeshinterfacecasing) · [玻璃连接纹理](https://github.com/GTNewHorizons/GT5-Unofficial/tree/5.09.54.265/src/main/resources/assets/gregtech/mcpatcher/ctm/blockglass1/nanochipglass) · [Angelica 连接规则](https://github.com/GTNewHorizons/Angelica/blob/2.2.43/src/main/java/com/prupe/mcpatcher/ctm/TileOverride.java)

要重新生成内置数据，在软件目录运行以下命令。脚本需要 Python 3.10 或更新版本。第一次运行会下载固定版本的源码归档。

```powershell
python -m pip install Pillow
python .\scripts\build_nac_data.py
```

## 从自己的游戏实例导入物品和图标

1. 把游戏语言设为简体中文，进入存档并打开物品栏。清空 NEI 搜索和物品筛选，使物品面板显示所需内容。
2. 在物品栏的 NEI 选项中打开「工具 → 数据存储 → 物品面板」，选择 CSV 并存储。游戏实例的 `dumps` 目录会出现 `itempanel.csv`。
3. 保持同一语言、筛选和排序，切换物品面板存储模式到 PNG，再导出一次。推荐使用 16×16 的原版图标尺寸。游戏会把图标保存到 `dumps/itempanel_icons`。
4. 在软件目录打开 PowerShell，将下面示例路径换成自己的实例路径。可省略 `--icons`，只导入名称和物品标识。
5. 在软件的「工程与数据」菜单选择「导入游戏数据包」，打开生成的 `本机物品.json`。

```powershell
python .\scripts\import_nei_catalog.py 'D:\GTNH\.minecraft\dumps\itempanel.csv' '.\本机物品.json' --icons 'D:\GTNH\.minecraft\dumps\itempanel_icons'
```

如果将大量 PNG 嵌入 JSON 会超过 80 MiB，可在命令末尾加 `--copy-icons`。图标会保存在 `%LOCALAPPDATA%\NAC路由设计工作室\NEI物品图标`。在另一台电脑使用这种数据包时，还需复制这个图标目录。

NEI 的 PNG 导出记录单帧。内置物品的动画可随导入后的对应条目继续使用。若有附加模组的动画图标，可通过 `--animated-icons "APNG目录"` 同时导入，文件名沿用 NEI 导出规则，扩展名为 `.png`。 [NEI 物品面板导出](https://github.com/GTNewHorizons/NotEnoughItems/blob/2.8.171-GTNH/src/main/java/codechicken/nei/config/ItemPanelDumper.java)

导入范围是当前 NEI 物品面板可见的条目。软件保留原始注册名、元数据和 NBT 标记。能按注册名和元数据匹配的条目会沿用对应的配方物品，其他条目按唯一名称匹配。NEI 的 CSV 和 PNG 模式由 [正式版 NEI 物品面板导出代码](https://github.com/GTNewHorizons/NotEnoughItems/blob/2.8.171-GTNH/src/main/java/codechicken/nei/config/ItemPanelDumper.java) 提供。

## 扩展数据格式

应用接受 UTF-8 JSON，可包含 `items`、`recipes`、`modules` 和 `circuits`。以记录的 `id` 为索引合并，`circuits` 内填写成品物品 ID。物品数量用个数表示，流体用 mB，配方耗时用刻，功率用 EU/t。

物品字段为 `id`、`name`、`kind`、`icon`。`kind` 为 `item` 或 `fluid`。`icon` 和可选的 `animatedIcon` 支持应用本地路径或 `data:image/png;base64,` 数据地址，后者可指向 APNG。模块字段为 `id`、`name`、`icon`、`dimensions`，尺寸顺序为宽、高、深。模块可用 `illustration` 提供高清结构图，`wikiImage` 和 `wikiImageSource` 可记录 Wiki 图片与来源。

配方字段为 `id`、`module`、`inputs`、`outputs`、`eu` 和 `ticks`。输入和输出元素包含 `item` 和 `amount`。`alternatives` 用于标记同一输入位置可替代的材料，`continuous` 用于标记按运行计量的流体。`waterTier`、`boardFluidTier`、`casingTier`、`calibration` 和 `alternateOutputs` 记录 NAC 特有的配方条件和产出。

`itempanel.csv` 提供物品目录。配方来自内置的 2.9.0 版本源码，也可通过上述 JSON 字段扩展。若需要整合包其他机器的 NEI 配方库，可参考 [NEI 配方导出器](https://github.com/Hermanoid/NotEnoughRecipeDumps) 的客户端采集方式，再转换为本软件的配方格式。
