#include <glab/desktop_ui.hpp>

namespace glab {
void DesktopUi::createItem() {
    if(busy() || !authenticated_ || !profileComplete_) return;
    switch(screen_) {
    case Screen::jobs:
        edit_("求人を投稿", {{"company","企業名"}, {"position","職種"}, {"category","業種"},
            {"url","掲載 URL"}, {"body","詳細","",true}}, [this](Json body) { write("POST", "/api/x/jobs/", std::move(body)); }); break;
    case Screen::events:
        edit_("予定を登録", {{"title","件名"}, {"startsAt","開始 (ISO8601・時差付き)"},
            {"endsAt","終了 (ISO8601・時差付き)"}, {"body","詳細","",true}},
            [this](Json body) { write("POST", "/api/x/events/events", std::move(body)); }); break;
    case Screen::consults:
        edit_("相談する", {{"title","件名"}, {"body","相談内容","",true}},
            [this](Json body) { write("POST", "/api/x/consult/consults", std::move(body)); }); break;
    default: break;
    }
}
void DesktopUi::itemAction(const Json& item) {
    if(busy() || !authenticated_ || !profileComplete_) return;
    if(!confirm_(screen_==Screen::events ? "この予定を削除しますか？" : screen_==Screen::jobs ? "この求人の募集を終了しますか？" : "この相談を解決済みにしますか？")) return;
    // 本人/admin 判定はサーバが必ず実施する。画面上の隠蔽を認可と見なさない。
    if(screen_==Screen::jobs && item.contains("id") && item["id"].is_number_integer()) {
        if(item.value("ownerUserId", Json{}).is_null() && !identity_.value("isAdmin",false)) { message_="所有者未確認です。管理者へ依頼してください。"; return; }
        write("POST", "/api/x/jobs/"+std::to_string(item["id"].get<long long>())+"/close");
    } else if(screen_==Screen::events && item.contains("id") && item["id"].is_number_integer()) {
        write("DELETE", "/api/x/events/events/"+std::to_string(item["id"].get<long long>()));
    } else if(screen_==Screen::consults && item.contains("id") && item["id"].is_string()) {
        const auto id=item["id"].get<std::string>();
        if(id.empty() || id.find_first_not_of("0123456789abcdefABCDEF-")!=std::string::npos) {
            message_="相談の識別情報を確認できません。"; return;
        }
        write("POST", "/api/x/consult/consults/"+id+"/resolve");
    }
}
void DesktopUi::editProfile() {
    if(busy() || !authenticated_) return;
    const auto profile=data_.value("profile", Json::object());
    edit_("プロフィール", {{"name","名前",profile.value("name","")},
        {"roleTitle","役職",profile.value("roleTitle","")},
        {"departmentName","学科",profile.value("departmentName","")}},
        [this](Json body) { write("PUT", "/api/x/vantan-user/profile", std::move(body)); });
}
void DesktopUi::setAvailability(bool available) {
    write("PUT", "/api/x/consult/availability", available
        ? Json{{"availableNow",true},{"hours",1}} : Json{{"availableNow",false}});
}
void DesktopUi::completeQuest() {
    if(!data_.contains("daily") || !data_["daily"].is_object()) return;
    const auto key=data_["daily"].value("dateKey", "");
    if(!key.empty()) write("POST", "/api/x/dashboard/daily-quest/complete", {{"dateKey",key}});
}
}
