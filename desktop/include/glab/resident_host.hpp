#pragma once
#include <glab/hub_bridge.hpp>
#include <string>

namespace glab {
// 実 Orbis bridge の組立後に、その native host の UI thread から呼ぶ。
// GLAB は window/tray/message-loop を所有する。bridge は終了まで生存させる。
int runResident(HubBridge& bridge, const std::string& trueTypeFont);
}
