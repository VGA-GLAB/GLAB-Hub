#pragma once
#include <future>
#include <functional>
#include <string>
#include <nlohmann/json.hpp>

namespace glab {
using Json = nlohmann::json;
struct HubReply { int status{}; Json body; };

// GLAB が必要とする接続口。Tela/Orbis の実 wire API は所有側で提供されるまで未接続。
// 実装は承認済み HTTPS Hub の同一 origin と認証 session を所有する。
// Cookie / access token / refresh token を応答、ログ、native UI に渡してはならない。
class HubBridge {
public:
    virtual ~HubBridge() = default;
    virtual std::future<HubReply> authenticate() = 0;
    virtual std::future<HubReply> request(std::string method, std::string path, Json body) = 0;
    // Orbis が既存 Ostiarius/passkey ceremony を行い、署名 attestation を既存 checkin API へ送る。
    virtual std::future<HubReply> checkIn() = 0;
    virtual void openBrowserFallback() = 0;
    // 切断・logout・identity変更で通知。解除時は登録済み callback の実行終了まで保証する。
    virtual void setSessionInvalidationHandler(std::function<void()> handler) noexcept = 0;
    // 全 pending を有限時間内に解決し、終了後の callback を禁止。user logout は別途 /auth/logout。
    virtual void cancelAll() noexcept = 0;
};
}
