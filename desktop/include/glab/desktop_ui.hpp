#pragma once
#include <glab/hub_bridge.hpp>
#include <tela/document.hpp>
#include <functional>
#include <optional>
#include <vector>

namespace glab {
enum class Screen { dashboard, profile, jobs, events, consults, attendance };
struct FormField { std::string key, label, value; bool multiline{}; };
// Tela の現行 text/button 要素に対する native text editor adapter。JSON 入力 UI は使わない。
using EditForm = std::function<void(std::string, std::vector<FormField>, std::function<void(Json)>)>;
using ConfirmAction = std::function<bool(std::string)>;

class DesktopUi {
public:
    DesktopUi(HubBridge&, EditForm, ConfirmAction);
    ~DesktopUi();
    DesktopUi(const DesktopUi&) = delete;
    DesktopUi& operator=(const DesktopUi&) = delete;
    tela::Document document();
    bool poll(); // UI thread only; future ready 時だけ再描画。
    bool busy() const noexcept { return pending_.has_value(); }
    void navigate(Screen);
    void login();
    void logout();
    void refresh();
    void checkIn();
    void createItem();
    void itemAction(const Json&);
    void editProfile();
    void setAvailability(bool);
    void completeQuest();
    void showBrowser();
    void sessionInvalidated();
private:
    enum class Completion { authentication, load, write, logout };
    struct Pending { std::future<HubReply> response; Completion completion; };
    void begin(std::future<HubReply>, Completion);
    void write(std::string method, std::string path, Json body = Json::object());
    void accept(HubReply, Completion);
    void renderContent(tela::Document&);
    HubBridge& bridge_;
    EditForm edit_;
    ConfirmAction confirm_;
    Screen screen_{Screen::dashboard};
    Json data_{Json::object()};
    Json identity_{Json::object()};
    std::optional<Json> detail_;
    std::size_t detailPage_{};
    bool authenticated_{};
    bool profileComplete_{};
    std::string message_{"Orbis でログインしてください。"};
    std::optional<Pending> pending_;
    std::size_t page_{};
};
}
