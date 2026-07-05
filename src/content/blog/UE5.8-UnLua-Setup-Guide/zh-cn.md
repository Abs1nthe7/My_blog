---
title: 在 UE 5.8 中配置 UnLua：从插件编译到 Lua 启动脚本
pubDate: 2026-07-05
description: 记录 UE 5.8 项目接入 UnLua 的实践过程，从插件兼容编译、目录配置到 Lua 启动脚本整理一套可落地的配置步骤。
slugId: ue58-unlua-setup-guide
category: 游戏开发学习
pinTop: 0
---

最近在 UE 5.8 项目里接 UnLua，遇到的主要问题不是“UnLua 怎么用”，而是旧版 UnLua 源码在 UE 5.8 下会碰到一批编译兼容问题。本文把整个配置过程整理一下：先聊聊为什么要用 UnLua，再说 UE 5.8 对这类插件的影响，最后给出一套可以落地的配置步骤。

本文基于 Tencent UnLua 做 UE 5.8 兼容整理。它不是官方发布版本，只是一次面向 UE 5.8 的实践记录。

原项目：https://github.com/Tencent/UnLua

## 为什么要在 UE 项目里用 UnLua

UnLua 的作用，是把 Lua 脚本接入 Unreal Engine，让一部分游戏逻辑可以从 C++ 或蓝图中拆出来，用脚本方式组织。

这件事最直接的好处是迭代快。C++ 很适合写底层系统、性能敏感逻辑和稳定框架，但如果所有玩法流程、UI 行为、任务脚本、触发器逻辑都放进 C++，每次小改动都要经历编译、热重载、重启编辑器，节奏会很重。Lua 文件是普通文本，修改和组织成本低，很适合承载变化频繁的业务逻辑。

UnLua 另一个重要价值是它能和 UE 的对象体系打通。Lua 侧可以访问 UObject、UClass、UFunction、UProperty 等反射对象，也可以和蓝图类绑定。这样项目里可以保持一种比较清晰的分工：

- C++ 负责核心系统、性能敏感代码、底层框架和复杂引擎扩展。
- 蓝图负责资产组织、可视化搭建、动画/UI 绑定和设计师可编辑内容。
- Lua 负责玩法流程、UI 交互、关卡脚本、任务逻辑、活动逻辑和快速原型。

如果项目未来考虑热更新，Lua 也更自然。虽然热更新本身还涉及资源管理、版本控制、下载校验等完整体系，但脚本层逻辑比 C++ 模块更适合做运行时加载和替换。

还有一个越来越现实的点：Lua 文件是文本，对 Agent 或 AI 辅助开发很友好。相比直接修改蓝图资产，生成、审查和回滚 Lua 逻辑都轻得多。

## UE 5.8 下为什么需要额外适配

UnLua 官方版本并不是直接为 UE 5.8 准备的。UE 5.8 的构建工具链和引擎 API 有一些变化，旧插件源码直接放进项目里，常见结果就是打开项目时出现：

```text
Missing Modules: UnLua, UnLuaEditor
```

这个弹窗的意思不是项目坏了，而是 `.uproject` 已经启用了 UnLua，但 UE 找不到当前引擎版本可用的插件 DLL。通常原因是插件还没编译，或者插件是别的 UE 版本编出来的。

这次适配 UE 5.8 时，主要遇到这些变化：

1. UE 5.8 使用更新的构建工具链

   本地验证时 UE 5.8 使用自带 .NET 10 SDK、VS2022 MSVC 工具链和 Windows SDK。旧版 UnLua 的 UBT/UHT 辅助项目仍按旧框架写，会碰到 `net6.0`、旧枚举、旧 API 不兼容。

2. UHT 插件 API 有变化

   UnLua 的默认参数收集器依赖 UHT 导出流程。UE 5.8 中需要从 `Session.Modules` 遍历 module 和 package，旧写法无法直接编译。

3. UObject 字段链表更多使用 `TObjectPtr`

   UE 5.8 中 `UStruct::Children`、`UField::Next` 等字段已经是 `TObjectPtr<UField>`，旧代码按 `UField**` 操作链表会类型不匹配。

4. Delegate API 有调整

   多播委托调用需要适配新的 `ProcessDelegate<UObject>(Params)` 写法。

5. 元数据 API 有变化

   `UMetaData::CopyMetadata` 需要改为 `FMetaData::CopyMetadata`，并补充对应 include。

6. 格式化字符串检查更严格

   `FString::Printf` 更倾向接受编译期可检查的字面量格式串。旧代码把变量作为 format 传入，容易在 UE 5.8 下失败。

7. Lua 内部类型名和 UE 类型名冲突

   Lua 内部的 `TString` 会和 UE 5.8 的类型/别名冲突，需要在包含 Lua 内部头文件时做隔离。

所以 UE 5.8 配 UnLua 的关键不是“把插件复制进去”这么简单，而是要先保证 UnLua 源码能被 UE 5.8 工具链完整编译。

## 准备工作

需要准备：

- Unreal Engine 5.8
- Visual Studio 2022 C++ 工具链
- Windows SDK
- 一个 UE 5.8 C++ 项目
- 已适配 UE 5.8 的 UnLua 插件源码

如果项目是纯蓝图项目，建议先在 UE 中添加一个空 C++ 类，让项目生成 `Source`、`.Target.cs`、`.Build.cs` 等 C++ 工程结构。UnLua 是 C++ 插件，最终需要通过 Unreal Build Tool 编译出对应模块。

## 最终目录结构

配置完成后，项目结构大致如下：

```text
YourProject/
  Config/
    DefaultUnLuaEditor.ini
  Content/
    Script/
      Main.lua
  Plugins/
    UnLua/
      UnLua.uplugin
      Source/
      Content/
      Config/
  Source/
  YourProject.uproject
```

其中：

- `Plugins/UnLua` 是插件本体。
- `Config/DefaultUnLuaEditor.ini` 用来配置 UnLua 编辑器行为和启动模块。
- `Content/Script/Main.lua` 是默认 Lua 启动入口。

## 第一步：复制 UnLua 插件

把适配过 UE 5.8 的 UnLua 插件复制到项目：

```text
YourProject/Plugins/UnLua
```

如果项目里已经有旧的 `Plugins/UnLua`，建议先备份旧目录，再放入新的插件。

注意不要把旧版本编译出来的 `Binaries`、`Intermediate` 当成可靠产物。UE 插件最好在当前机器、当前引擎版本下重新编译。

## 第二步：在 uproject 中启用插件

打开项目 `.uproject`，在 `Plugins` 数组里加入 UnLua：

```json
{
  "Name": "UnLua",
  "Enabled": true
}
```

一个简化示例：

```json
{
  "FileVersion": 3,
  "EngineAssociation": "5.8",
  "Modules": [
    {
      "Name": "YourProject",
      "Type": "Runtime",
      "LoadingPhase": "Default"
    }
  ],
  "Plugins": [
    {
      "Name": "UnLua",
      "Enabled": true
    }
  ]
}
```

如果项目中已经有其他插件，不要覆盖原来的 `Plugins` 数组，只需要追加 UnLua 这一项。

## 第三步：添加 UnLua 配置

创建或修改：

```text
Config/DefaultUnLuaEditor.ini
```

写入：

```ini
[/Script/UnLuaEditor.UnLuaEditorSettings]
bAutoStartup=True
bEnableDebug=True
HotReloadMode=Manual
LuaVersion=lua-5.4.3

[/Script/UnLua.UnLuaSettings]
StartupModuleName=Main
```

这里比较关键的是：

```ini
StartupModuleName=Main
```

它表示 UnLua 启动时加载 `Content/Script/Main.lua`。

## 第四步：添加 Lua 启动文件

创建目录：

```text
Content/Script
```

然后创建：

```text
Content/Script/Main.lua
```

写入一个最小启动模块：

```lua
local M = {}

function M.Initialize()
    print("UnLua initialized")
end

return M
```

这个文件只是验证 UnLua 启动链路用的。项目真正开始写逻辑后，可以在这里继续拆分模块、初始化系统、加载其他 Lua 文件。

## 第五步：生成项目文件

打开 PowerShell，执行：

```powershell
& "C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat" -projectfiles -project="C:\YourProject\YourProject.uproject" -game -rocket -progress
```

把 `C:\YourProject\YourProject.uproject` 换成自己的项目路径。

这一步会让 UE 重新识别插件、模块和工程结构。

## 第六步：编译 Editor 目标

执行：

```powershell
& "C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat" YourProjectEditor Win64 Development -Project="C:\YourProject\YourProject.uproject" -WaitMutex -FromMsBuild -NoHotReloadFromIDE
```

需要替换两处：

- `YourProjectEditor`：项目名加 `Editor`
- `C:\YourProject\YourProject.uproject`：项目 `.uproject` 完整路径

这里建议保留：

```powershell
-NoHotReloadFromIDE
```

它可以绕开 Live Coding/Hot Reload 锁定模块导致的编译失败。配置插件时，最好关闭 UE Editor 和 Live Coding Console，再执行完整编译。

编译成功后，项目里应该生成：

```text
Plugins/UnLua/Binaries/Win64/UnrealEditor-UnLua.dll
Plugins/UnLua/Binaries/Win64/UnrealEditor-UnLuaEditor.dll
```

这两个 DLL 存在后，再打开 `.uproject`，一般就不会再弹：

```text
Missing Modules: UnLua, UnLuaEditor
```

## UE 5.8 兼容修改摘要

如果你是从官方 UnLua 源码自己适配 UE 5.8，下面这些点是这次实际改过的地方。

### Lua.Build.cs

位置：

```text
Source/ThirdParty/Lua/Lua.Build.cs
```

旧代码里使用了 `WindowsCompiler.VisualStudio2019` 之类的枚举判断。UE 5.8 中这个枚举不再适用，可以改成字符串判断：

```csharp
Target.WindowsPlatform.Compiler.ToString() == "VisualStudio2019"
```

### UHT 辅助项目改为 net10.0

位置：

```text
Source/UnLuaDefaultParamCollectorUbtPlugin/UnLuaDefaultParamCollectorUbtPlugin.ubtplugin.csproj
```

将：

```xml
<TargetFramework>net6.0</TargetFramework>
```

改为：

```xml
<TargetFramework>net10.0</TargetFramework>
```

同时移除不需要的 `Microsoft.CSharp` 包引用，匹配 UE 5.8 自带 .NET 10。

### 适配 UHT Session API

位置：

```text
Source/UnLuaDefaultParamCollectorUbtPlugin/UnLuaDefaultParamCollectorUbtPlugin.cs
```

UE 5.8 中需要从：

```csharp
Session.Modules
```

遍历 module，再遍历 package，旧的 UHT 导出写法不能直接使用。

### 修正 MetaClass 写法

位置：

```text
Source/UnLua/Public/UnLuaSettings.h
```

将：

```cpp
MetaClass="Object"
```

改为：

```cpp
MetaClass="/Script/CoreUObject.Object"
```

### 补充旧模板兼容定义

位置：

```text
Source/UnLua/Public/UnLuaTemplate.h
```

补充：

```cpp
TChooseClass
TIsTriviallyDestructible
TIsTriviallyCopyConstructible
```

这些是 UnLua 旧代码依赖、但在 UE 5.8 下需要自行兼容的模板类型。

### 避免 Lua 内部 TString 冲突

位置：

```text
Source/UnLua/Private/LuaCore.cpp
Source/UnLua/Private/LuaEnv.cpp
```

在包含 Lua 内部头文件时，用类似方式隔离：

```cpp
#define TString LuaTString
// include Lua internal headers
#undef TString
```

### 调整 AsyncObjectFlags

位置：

```text
Source/UnLua/Private/LuaEnv.cpp
```

去掉不兼容的：

```cpp
AsyncLoading
```

保留：

```cpp
Async
```

### 元数据复制 API

位置：

```text
Source/UnLua/Private/LuaFunction.cpp
```

增加：

```cpp
#include "UObject/MetaData.h"
```

并将：

```cpp
UMetaData::CopyMetadata(...)
```

改成：

```cpp
FMetaData::CopyMetadata(...)
```

### Delegate 调用方式

位置：

```text
Source/UnLua/Private/ReflectionUtils/FunctionDesc.cpp
```

多播委托调用改为：

```cpp
ScriptDelegate->ProcessDelegate<UObject>(Params);
```

### FString::Printf 使用字面量格式串

位置：

```text
Source/UnLua/Private/UnLuaConsoleCommands.cpp
```

不要把变量作为 format 传给 `FString::Printf`，改为直接传 `TEXT(R"(... )")` 这样的字面量。

### 修复日志参数缺失

位置：

```text
Source/UnLua/Private/UnLuaBase.cpp
```

有一处日志格式串需要两个 `%s`，但只传了一个参数，需要补上：

```cpp
ANSI_TO_TCHAR(__FUNCTION__)
```

### 适配 TObjectPtr 字段链表

位置：

```text
Source/UnLua/Private/LuaOverridesClass.cpp
```

UE 5.8 中：

```cpp
UStruct::Children
UField::Next
```

是 `TObjectPtr<UField>`，链表操作要改成使用：

```cpp
TObjectPtr<UField>*
```

而不是旧的 `UField**`。

## 常见问题

### 打开项目仍然提示 Missing Modules

说明 UE 仍然没有找到当前引擎版本可用的插件模块。检查：

- `Plugins/UnLua` 是否存在。
- `.uproject` 是否启用了 `UnLua`。
- 是否已经成功编译 `YourProjectEditor`。
- 是否生成了 `UnrealEditor-UnLua.dll` 和 `UnrealEditor-UnLuaEditor.dll`。
- UE Editor 和 Live Coding Console 是否还开着。

建议关闭编辑器和 Live Coding Console 后重新编译。

### 编译时提示 Live Coding 正在运行

编译命令加上：

```powershell
-NoHotReloadFromIDE
```

如果仍然失败，就完全关闭 UE Editor 和 Live Coding Console，再执行 `Build.bat`。

### 项目是纯蓝图项目怎么办

先在 UE 编辑器里添加一个空 C++ 类，生成 C++ 项目结构，再配置 UnLua。否则很多 C++ 插件相关的构建流程会不完整。

### 是否应该提交 Binaries

一般不建议提交：

```text
Plugins/UnLua/Binaries/
Plugins/UnLua/Intermediate/
```

它们是当前机器、当前引擎版本生成的构建产物。更推荐提交源码和配置，让每台机器自己编译。

推荐 `.gitignore`：

```gitignore
Binaries/
Intermediate/
Saved/
DerivedDataCache/

*.pdb
*.dll
*.modules
*.target
```

## 总结

在 UE 5.8 中配置 UnLua，真正重要的是三件事：

第一，使用已经适配 UE 5.8 的 UnLua 源码。旧源码直接复制进项目，大概率会在 UBT/UHT、Delegate、`TObjectPtr`、元数据 API 等地方报错。

第二，把插件接入项目：复制到 `Plugins/UnLua`，在 `.uproject` 中启用，添加 `DefaultUnLuaEditor.ini`，创建 `Content/Script/Main.lua`。

第三，用 UE 5.8 的 `Build.bat` 编译 `YourProjectEditor Win64 Development`，让当前引擎版本生成自己的 `UnLua` 和 `UnLuaEditor` DLL。

只要插件模块编译成功，`Missing Modules: UnLua, UnLuaEditor` 这类弹窗就会消失，后续就可以开始把玩法、UI 或关卡逻辑逐步拆到 Lua 里。
