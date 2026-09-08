#include <glab/desktop_ui.hpp>
#include <algorithm>

namespace glab {
namespace {
std::string text(const Json& object, const char* key) {
    if(!object.is_object() || !object.contains(key) || object[key].is_null()) return {};
    if(object[key].is_string()) return object[key].get<std::string>();
    if(object[key].is_number()) return object[key].dump();
    return {};
}
const char* title(Screen screen) {
    switch(screen) {
    case Screen::dashboard: return "ホーム"; case Screen::profile: return "プロフィール";
    case Screen::jobs: return "求人"; case Screen::events: return "予定";
    case Screen::consults: return "相談"; case Screen::attendance: return "出席";
    }
    return "GLAB";
}
}
tela::Document DesktopUi::document() {
    tela::Document doc;
    doc.panel("glab", [&] {
        doc.text("title", std::string("GLAB — ")+title(screen_), {.height=40});
        if(!message_.empty()) doc.text("message", message_, {.height=65});
        if(!authenticated_) {
            if(!busy()) doc.button("login", "Orbis でログイン", [this] { login(); });
        } else if(!busy()) {
            doc.panel("navigation", [&] {
                for(const auto screen : {Screen::dashboard,Screen::profile,Screen::jobs,Screen::events,Screen::consults,Screen::attendance})
                    doc.button("nav-"+std::to_string(static_cast<int>(screen)), title(screen), [this,screen] { navigate(screen); }, {.width=105});
            }, {.flow=tela::Flow::row});
            doc.panel("session", [&] {
                doc.button("refresh", "更新", [this] { refresh(); }, {.width=100});
                doc.button("logout", "ログアウト", [this] { logout(); }, {.width=160});
            }, {.flow=tela::Flow::row});
            renderContent(doc);
        }
        doc.button("browser", "ブラウザで復旧する", [this] { showBrowser(); });
    });
    return doc;
}
void DesktopUi::renderContent(tela::Document& doc) {
    if(detail_) {
        doc.button("detail-back", "一覧へ戻る", [this] { detail_.reset(); });
        doc.text("detail-title", text(*detail_,screen_==Screen::jobs ? "company" : "title"), {.height=50});
        const auto body=text(*detail_,"body");
        std::vector<std::string> pages;
        for(std::size_t start=0;start<body.size();) {
            auto end=std::min(body.size(),start+900);
            while(end<body.size() && (static_cast<unsigned char>(body[end])&0xc0)==0x80) --end;
            pages.push_back(body.substr(start,end-start)); start=end;
        }
        if(pages.empty()) pages.push_back("本文はありません。");
        if(detailPage_>=pages.size()) detailPage_=0;
        doc.text("detail-body", pages[detailPage_], {.height=540});
        doc.panel("detail-pages", [&] {
            if(detailPage_>0) doc.button("detail-previous", "前へ", [this] { --detailPage_; }, {.width=120});
            if(detailPage_+1<pages.size()) doc.button("detail-next", "次へ", [this] { ++detailPage_; }, {.width=120});
        }, {.flow=tela::Flow::row});
        return;
    }
    if(screen_==Screen::profile) {
        const auto profile=data_.value("profile", Json::object());
        doc.text("profile", text(profile,"name")+" / "+text(profile,"departmentName")+" / "+text(profile,"roleTitle"), {.height=55});
        doc.button("edit-profile", "プロフィールを編集", [this] { editProfile(); }); return;
    }
    if(screen_==Screen::dashboard) {
        if(data_.contains("profile") && data_["profile"].is_object()) doc.text("welcome", text(data_["profile"],"name")+" さん");
        if(data_.contains("daily") && data_["daily"].is_object()) {
            const auto& daily=data_["daily"];
            if(daily.contains("quest")) doc.text("quest", text(daily["quest"],"title"), {.height=70});
            if(!daily.value("completed",false)) doc.button("quest-done", "今日のクエストを達成", [this] { completeQuest(); });
        }
        return;
    }
    if(screen_==Screen::attendance) {
        doc.button("check-in", "会場のパスキーで出席", [this] { checkIn(); });
    } else {
        doc.button("create", screen_==Screen::consults ? "新しい相談" : "新規登録", [this] { createItem(); });
    }
    if(screen_==Screen::consults) {
        doc.panel("availability", [&] {
            doc.button("available", "1時間相談可能にする", [this] { setAvailability(true); }, {.width=230});
            doc.button("unavailable", "相談可能を解除", [this] { setAvailability(false); }, {.width=200});
        }, {.flow=tela::Flow::row});
    }
    const char* collection=screen_==Screen::jobs ? "jobs" : screen_==Screen::events ? "events" : screen_==Screen::consults ? "consults" : "attendance";
    if(!data_.contains(collection) || !data_[collection].is_array()) { doc.text("empty", "表示できるデータがありません。"); return; }
    const auto& rows=data_[collection];
    constexpr std::size_t pageSize=3;
    if(page_*pageSize>=rows.size()) page_=0;
    if(rows.empty()) doc.text("empty", "まだ登録されていません。");
    for(std::size_t index=page_*pageSize;index<std::min(rows.size(),(page_+1)*pageSize);++index) {
        const auto item=rows[index];
        doc.panel("item-"+std::to_string(index), [&] {
            auto label=screen_==Screen::jobs ? text(item,"company")+" "+text(item,"position") : text(item,"title");
            if(screen_==Screen::events) label+=" / "+text(item,"startsAt")+" — "+text(item,"endsAt");
            if(screen_==Screen::attendance) label=text(item,"date")+" / "+text(item,"facilityId");
            doc.text("label-"+std::to_string(index), label, {.height=45});
            doc.text("body-"+std::to_string(index), text(item,"body"), {.height=65});
            if(screen_!=Screen::attendance) doc.button("detail-"+std::to_string(index), "詳細を読む", [this,item] { detail_=item; detailPage_=0; });
            const auto owner=text(item,screen_==Screen::jobs ? "ownerUserId" : "createdBy");
            const bool canChange=identity_.value("isAdmin",false) || (!owner.empty() && owner==text(identity_,"userId"));
            if(screen_!=Screen::attendance && text(item,"status")!="closed" && canChange) {
                doc.button("action-"+std::to_string(index), screen_==Screen::jobs ? "募集終了" : screen_==Screen::events ? "予定を削除" : "解決済みにする",
                    [this,item] { itemAction(item); });
            }
        });
    }
    doc.panel("pages", [&] {
        if(page_>0) doc.button("previous", "前へ", [this] { --page_; }, {.width=120});
        if((page_+1)*pageSize<rows.size()) doc.button("next", "次へ", [this] { ++page_; }, {.width=120});
    }, {.flow=tela::Flow::row});
}
}
