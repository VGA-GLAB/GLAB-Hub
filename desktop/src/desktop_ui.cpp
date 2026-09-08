#include <glab/desktop_ui.hpp>
#include <chrono>
#include <stdexcept>

namespace glab {
namespace {
std::string route(Screen screen) {
    switch(screen) {
    case Screen::dashboard: return "/api/x/dashboard/summary";
    case Screen::profile: return "/api/x/vantan-user/profile";
    case Screen::jobs: return "/api/x/jobs/?status=all";
    case Screen::events: return "/api/x/events/events";
    case Screen::consults: return "/api/x/consult/consults";
    case Screen::attendance: return "/api/x/attendance/mine";
    }
    throw std::logic_error("Unknown GLAB screen");
}
}
DesktopUi::DesktopUi(HubBridge& bridge, EditForm edit, ConfirmAction confirm)
    : bridge_(bridge), edit_(std::move(edit)), confirm_(std::move(confirm)) {
    if(!edit_ || !confirm_) throw std::invalid_argument("Native form and confirmation adapters required");
}
DesktopUi::~DesktopUi() { bridge_.cancelAll(); }
void DesktopUi::begin(std::future<HubReply> response, Completion completion) {
    if(!response.valid()) throw std::runtime_error("Bridge returned no response future");
    pending_.emplace(Pending{std::move(response), completion});
    message_="処理中…";
}
bool DesktopUi::poll() {
    if(!pending_ || pending_->response.wait_for(std::chrono::seconds(0)) != std::future_status::ready) return false;
    const auto completion=pending_->completion;
    try {
        auto result=pending_->response.get(); pending_.reset();
        accept(std::move(result), completion);
    } catch(...) {
        pending_.reset(); data_=Json::object();
        message_="通信または応答の解釈に失敗しました。更新で再確認してください。";
    }
    return true;
}
void DesktopUi::accept(HubReply reply, Completion completion) {
    if(reply.status==401) {
        detail_.reset();
        authenticated_=false; profileComplete_=false; data_=Json::object(); identity_=Json::object();
        message_="セッションが切れました。Orbis でログインしてください。"; return;
    }
    if(reply.status<200 || reply.status>=300) {
        data_=Json::object();
        message_=reply.status==403 ? "この操作は許可されていません。部員資格・所有者を管理者へ確認してください。"
            : reply.status==409 ? "他の更新と競合しました。一覧を更新して再確認してください。"
            : reply.status==400 || reply.status==422 ? "入力内容を確認してください。"
            : reply.status==429 ? "操作が続いています。少し待って再試行してください。"
            : "サービスを利用できません。時間をおいて更新してください。";
        return;
    }
    if(completion==Completion::logout) {
        detail_.reset();
        authenticated_=false; profileComplete_=false; data_=Json::object(); identity_=Json::object(); message_="ログアウトしました。"; return;
    }
    if(completion==Completion::authentication) {
        if(!reply.body.is_object() || !reply.body.contains("userId") || !reply.body["userId"].is_string()
            || reply.body["userId"].get<std::string>().empty()) throw std::runtime_error("Invalid authenticated identity");
        identity_=std::move(reply.body);
        authenticated_=true; navigate(Screen::profile); return;
    }
    if(completion==Completion::write) { refresh(); return; }
    if(!reply.body.is_object()) throw std::runtime_error("Invalid GLAB response");
    data_=std::move(reply.body); message_.clear();
    if(screen_==Screen::profile) profileComplete_=data_.value("complete", false);
}
void DesktopUi::navigate(Screen screen) {
    if(busy()) return;
    if(!authenticated_) { message_="ログインしてください。"; return; }
    if(!profileComplete_ && screen!=Screen::profile) { message_="プロフィールの登録を完了してください。"; return; }
    screen_=screen; page_=0; detail_.reset(); data_=Json::object(); refresh();
}
void DesktopUi::refresh() {
    if(busy() || !authenticated_) return;
    try { begin(bridge_.request("GET", route(screen_), Json::object()), Completion::load); }
    catch(...) { data_=Json::object(); message_="Orbis との接続を確認してください。"; }
}
void DesktopUi::login() {
    if(busy()) return;
    try { begin(bridge_.authenticate(), Completion::authentication); }
    catch(...) { message_="Orbis の認証を開始できませんでした。"; }
}
void DesktopUi::logout() {
    if(busy() || !authenticated_) return;
    try { begin(bridge_.request("POST", "/auth/logout", Json::object()), Completion::logout); }
    catch(...) { message_="ログアウトできませんでした。Orbis の接続を確認してください。"; }
}
void DesktopUi::write(std::string method, std::string path, Json body) {
    if(busy() || !authenticated_) return;
    try { begin(bridge_.request(std::move(method), std::move(path), std::move(body)), Completion::write); }
    catch(...) { message_="送信できませんでした。結果を一覧で確認してください。"; }
}
void DesktopUi::checkIn() {
    if(busy() || !authenticated_ || !profileComplete_) return;
    try { begin(bridge_.checkIn(), Completion::write); }
    catch(...) { message_="出席確認を開始できません。Orbis と会場 gateway の接続を確認してください。"; }
}
void DesktopUi::showBrowser() {
    try { bridge_.openBrowserFallback(); }
    catch(...) { message_="ブラウザを開けませんでした。"; }
}
void DesktopUi::sessionInvalidated() {
    bridge_.cancelAll(); pending_.reset();
    authenticated_=false; profileComplete_=false; data_=Json::object(); identity_=Json::object(); detail_.reset();
    message_="Orbis のセッションが変更または切断されました。再ログインしてください。";
}
}
