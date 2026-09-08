#pragma once
#include <glab/desktop_ui.hpp>
#include <windows.h>

namespace glab {
std::wstring toWide(const std::string&);
std::string toUtf8(const std::wstring&);
std::optional<Json> editNativeForm(HWND parent, const std::string& title, const std::vector<FormField>& fields);
}
